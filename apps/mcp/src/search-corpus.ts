import { randomUUID } from "node:crypto";
import { loadRagConfig, retrieve } from "@lumen/rag";
import { mcpSearchInputSchema, type McpSearchOutput } from "@lumen/shared";
import { logMcpSearch } from "./search-log.js";

export const SEARCH_CORPUS_TOOL_NAME = "search_corpus";

export const searchCorpusInputShape = mcpSearchInputSchema.shape;

export async function runSearchCorpus(
  args: { query: string; topK?: number; mode?: "vector" | "hybrid" },
  principal: string
): Promise<McpSearchOutput> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const mode = args.mode ?? loadRagConfig().retrievalMode;

  const results = await retrieve({ query: args.query, topK: args.topK, mode: args.mode });
  const latencyMs = Date.now() - startedAt;

  const output: McpSearchOutput = {
    results: results.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      sourceKey: r.sourceKey,
      pageNumber: r.pageNumber,
      sectionTitle: r.sectionTitle,
      content: r.content,
      score: r.score,
      rank: r.rank
    })),
    resultCount: results.length,
    requestId
  };

  await logMcpSearch({
    principal,
    query: args.query,
    retrievalMode: mode,
    topK: args.topK ?? results.length,
    latencyMs,
    resultCount: results.length,
    topScore: results[0]?.score ?? null,
    answerStatus: results.length > 0 ? "ANSWERED" : "INSUFFICIENT_CONTEXT"
  });

  return output;
}
