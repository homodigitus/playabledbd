import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { and, eq, notInArray } from "drizzle-orm";
import {
  documentChunks,
  documents,
  getDb,
  getSqlClient,
  ingestionItems,
  ingestionRuns
} from "@lumen/db";
import { MAX_INGEST_FILE_SIZE_BYTES, type IngestionRunStatus } from "@lumen/shared";
import { chunkDocument } from "../chunking/chunker.js";
import { loadRagConfig } from "../config.js";
import { embedTexts } from "../embeddings.js";
import { sha256Hex } from "../hashing.js";
import { isSupportedExtension, loadDocument } from "../loaders/index.js";
import { mimeTypeForExtension, walkCorpusFiles } from "./walk.js";
import { sanitizeErrorMessage } from "./sanitize.js";

const INGESTION_LOCK_KEY = 727_002;

export class IngestionConflictError extends Error {
  constructor() {
    super("Another ingestion run is already in progress");
    this.name = "IngestionConflictError";
  }
}

export type RunIngestionOptions = {
  /** Only trusted callers (the CLI) may override this. The admin HTTP endpoint always omits it
   * and falls back to CORPUS_ROOT — see apps/api ingestion route. */
  sourcePath?: string;
  triggeredByUserId?: string | null;
};

export type IngestionRunSummary = {
  runId: string;
  status: IngestionRunStatus;
  documentsSeen: number;
  documentsIndexed: number;
  documentsSkipped: number;
  documentsFailed: number;
  chunksCreated: number;
};

async function tryAcquireLock(): Promise<boolean> {
  const sql = getSqlClient();
  const rows = await sql<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${INGESTION_LOCK_KEY}) as locked`;
  return rows[0]?.locked === true;
}

async function releaseLock(): Promise<void> {
  const sql = getSqlClient();
  await sql`SELECT pg_advisory_unlock(${INGESTION_LOCK_KEY})`;
}

export async function runIngestion(opts: RunIngestionOptions = {}): Promise<IngestionRunSummary> {
  const cfg = loadRagConfig();
  const sourceRoot = resolve(opts.sourcePath ?? cfg.corpusRoot);

  await fs.access(sourceRoot).catch(() => {
    throw new Error(`Corpus source path does not exist: ${sourceRoot}`);
  });

  const locked = await tryAcquireLock();
  if (!locked) throw new IngestionConflictError();

  const db = getDb();
  const counters = {
    seen: 0,
    indexed: 0,
    skipped: 0,
    failed: 0,
    chunksCreated: 0
  };
  const failureMessages: string[] = [];

  const [run] = await db
    .insert(ingestionRuns)
    .values({ status: "RUNNING", sourcePath: sourceRoot, startedAt: new Date(), triggeredByUserId: opts.triggeredByUserId ?? null })
    .returning({ id: ingestionRuns.id });
  const runId = run!.id;

  try {
    const files = await walkCorpusFiles(sourceRoot);
    const existingDocs = await db
      .select({
        id: documents.id,
        sourceKey: documents.sourceKey,
        contentSha256: documents.contentSha256,
        status: documents.status
      })
      .from(documents);
    const existingBySourceKey = new Map(existingDocs.map((d) => [d.sourceKey, d]));
    const seenSourceKeys = new Set<string>();

    for (const file of files) {
      counters.seen += 1;
      seenSourceKeys.add(file.sourceKey);
      const startedAt = new Date();

      const recordItem = async (
        status: "INDEXED" | "UNCHANGED" | "SKIPPED_UNSUPPORTED" | "FAILED",
        message: string | null,
        documentId: string | null
      ) => {
        await db.insert(ingestionItems).values({
          runId,
          sourceKey: file.sourceKey,
          documentId,
          status,
          message,
          startedAt,
          finishedAt: new Date()
        });
      };

      try {
        const stat = await fs.stat(file.absolutePath);
        if (stat.size > MAX_INGEST_FILE_SIZE_BYTES) {
          counters.skipped += 1;
          await recordItem("SKIPPED_UNSUPPORTED", `File exceeds ${MAX_INGEST_FILE_SIZE_BYTES} byte limit`, null);
          continue;
        }
        if (!isSupportedExtension(file.sourceKey)) {
          counters.skipped += 1;
          await recordItem("SKIPPED_UNSUPPORTED", "Unsupported file extension", null);
          continue;
        }

        const buffer = await fs.readFile(file.absolutePath);
        const hash = sha256Hex(buffer);
        const existing = existingBySourceKey.get(file.sourceKey);

        if (existing && existing.contentSha256 === hash && existing.status === "INDEXED") {
          counters.indexed += 1;
          await recordItem("UNCHANGED", "Content unchanged since last ingestion", existing.id);
          continue;
        }

        const loaded = await loadDocument(file.sourceKey, buffer);
        const chunkDrafts = chunkDocument(loaded, {
          chunkSizeTokens: cfg.chunkSizeTokens,
          chunkOverlapTokens: cfg.chunkOverlapTokens,
          embeddingModel: cfg.embeddingModel
        });

        if (chunkDrafts.length === 0) {
          counters.failed += 1;
          const message = "Document produced no extractable text content";
          failureMessages.push(`${file.sourceKey}: ${message}`);
          const [doc] = await db
            .insert(documents)
            .values({
              sourceKey: file.sourceKey,
              title: loaded.title,
              fileName: file.sourceKey,
              mimeType: mimeTypeForExtension(file.sourceKey),
              sizeBytes: stat.size,
              contentSha256: hash,
              status: "FAILED",
              chunkCount: 0,
              errorMessage: message,
              updatedAt: new Date()
            })
            .onConflictDoUpdate({
              target: documents.sourceKey,
              set: {
                title: loaded.title,
                sizeBytes: stat.size,
                contentSha256: hash,
                status: "FAILED",
                chunkCount: 0,
                errorMessage: message,
                updatedAt: new Date()
              }
            })
            .returning({ id: documents.id });
          await recordItem("FAILED", message, doc!.id);
          continue;
        }

        let embeddings: number[][];
        try {
          embeddings = await embedTexts(chunkDrafts.map((c) => c.text));
        } catch (err) {
          counters.failed += 1;
          const message = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
          failureMessages.push(`${file.sourceKey}: ${message}`);
          const [doc] = await db
            .insert(documents)
            .values({
              sourceKey: file.sourceKey,
              title: loaded.title,
              fileName: file.sourceKey,
              mimeType: mimeTypeForExtension(file.sourceKey),
              sizeBytes: stat.size,
              contentSha256: hash,
              status: "FAILED",
              chunkCount: 0,
              errorMessage: message,
              updatedAt: new Date()
            })
            .onConflictDoUpdate({
              target: documents.sourceKey,
              set: { status: "FAILED", errorMessage: message, updatedAt: new Date() }
            })
            .returning({ id: documents.id });
          await recordItem("FAILED", message, doc!.id);
          continue;
        }

        const docId = await db.transaction(async (tx) => {
          const [doc] = await tx
            .insert(documents)
            .values({
              sourceKey: file.sourceKey,
              title: loaded.title,
              fileName: file.sourceKey,
              mimeType: mimeTypeForExtension(file.sourceKey),
              sizeBytes: stat.size,
              contentSha256: hash,
              status: "PROCESSING",
              chunkCount: 0,
              errorMessage: null,
              updatedAt: new Date()
            })
            .onConflictDoUpdate({
              target: documents.sourceKey,
              set: {
                title: loaded.title,
                sizeBytes: stat.size,
                contentSha256: hash,
                status: "PROCESSING",
                errorMessage: null,
                updatedAt: new Date()
              }
            })
            .returning({ id: documents.id });

          await tx.delete(documentChunks).where(eq(documentChunks.documentId, doc!.id));

          await tx.insert(documentChunks).values(
            chunkDrafts.map((chunk, idx) => ({
              documentId: doc!.id,
              chunkIndex: chunk.chunkIndex,
              content: chunk.text,
              tokenCount: chunk.tokenCount,
              embedding: embeddings[idx]!,
              pageNumber: chunk.pageNumber ?? null,
              sectionTitle: chunk.sectionTitle ?? null,
              embeddingModel: cfg.embeddingModel
            }))
          );

          await tx
            .update(documents)
            .set({ status: "INDEXED", chunkCount: chunkDrafts.length, lastIndexedAt: new Date(), updatedAt: new Date() })
            .where(eq(documents.id, doc!.id));

          return doc!.id;
        });

        counters.indexed += 1;
        counters.chunksCreated += chunkDrafts.length;
        await recordItem("INDEXED", null, docId);
      } catch (err) {
        counters.failed += 1;
        const message = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
        failureMessages.push(`${file.sourceKey}: ${message}`);
        await recordItem("FAILED", message, null);
      }
    }

    const removedCandidates = await db
      .select({ id: documents.id, sourceKey: documents.sourceKey })
      .from(documents)
      .where(
        and(
          notInArray(documents.sourceKey, seenSourceKeys.size > 0 ? Array.from(seenSourceKeys) : [""]),
          notInArray(documents.status, ["REMOVED"])
        )
      );

    for (const removed of removedCandidates) {
      await db
        .update(documents)
        .set({ status: "REMOVED", updatedAt: new Date() })
        .where(eq(documents.id, removed.id));
      await db.insert(ingestionItems).values({
        runId,
        sourceKey: removed.sourceKey,
        documentId: removed.id,
        status: "REMOVED",
        message: "No longer present under the corpus source",
        startedAt: new Date(),
        finishedAt: new Date()
      });
    }

    const allFailed = counters.seen > 0 && counters.failed === counters.seen;
    const finalStatus: IngestionRunStatus = allFailed
      ? "FAILED"
      : counters.failed > 0
        ? "PARTIAL"
        : "SUCCEEDED";

    await db
      .update(ingestionRuns)
      .set({
        status: finalStatus,
        finishedAt: new Date(),
        documentsSeen: counters.seen,
        documentsIndexed: counters.indexed,
        documentsSkipped: counters.skipped,
        documentsFailed: counters.failed,
        chunksCreated: counters.chunksCreated,
        errorSummary: failureMessages.length > 0 ? failureMessages.slice(0, 10).join(" | ") : null
      })
      .where(eq(ingestionRuns.id, runId));

    return {
      runId,
      status: finalStatus,
      documentsSeen: counters.seen,
      documentsIndexed: counters.indexed,
      documentsSkipped: counters.skipped,
      documentsFailed: counters.failed,
      chunksCreated: counters.chunksCreated
    };
  } catch (err) {
    await db
      .update(ingestionRuns)
      .set({
        status: "FAILED",
        finishedAt: new Date(),
        documentsSeen: counters.seen,
        documentsIndexed: counters.indexed,
        documentsSkipped: counters.skipped,
        documentsFailed: counters.failed,
        chunksCreated: counters.chunksCreated,
        errorSummary: sanitizeErrorMessage(err instanceof Error ? err.message : String(err))
      })
      .where(eq(ingestionRuns.id, runId));
    throw err;
  } finally {
    await releaseLock();
  }
}
