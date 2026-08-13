import { getSqlClient } from "@lumen/db";
import { RETRIEVAL_DEFAULTS, type RetrievalMode, type SearchResult } from "@lumen/shared";
import { loadRagConfig } from "../config.js";
import { embedQuery } from "../embeddings.js";
import { reciprocalRankFusion, type RankedCandidate } from "./rrf.js";

type ChunkRow = {
  chunk_id: string;
  document_id: string;
  document_title: string;
  source_key: string;
  content: string;
  page_number: number | null;
  section_title: string | null;
};

export type RetrievalResult = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  sourceKey: string;
  content: string;
  pageNumber?: number;
  sectionTitle?: string;
  score: number;
  rank: number;
  vectorSimilarity?: number;
};

export type RetrieveOptions = {
  query: string;
  topK?: number;
  mode?: RetrievalMode;
};

function rowToBase(row: ChunkRow) {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id,
    documentTitle: row.document_title,
    sourceKey: row.source_key,
    content: row.content,
    pageNumber: row.page_number ?? undefined,
    sectionTitle: row.section_title ?? undefined
  };
}

async function vectorCandidates(
  queryEmbedding: number[],
  pool: number
): Promise<Array<ChunkRow & { similarity: number }>> {
  const sql = getSqlClient();
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  return sql<Array<ChunkRow & { similarity: number }>>`
    SELECT c.id as chunk_id, c.document_id, d.title as document_title, d.source_key,
           c.content, c.page_number, c.section_title,
           (1 - (c.embedding <=> ${vectorLiteral}::vector))::float8 as similarity
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE d.status = 'INDEXED' AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${vectorLiteral}::vector
    LIMIT ${pool}
  `;
}

async function keywordCandidates(query: string, pool: number): Promise<ChunkRow[]> {
  const sql = getSqlClient();

  return sql<ChunkRow[]>`
    SELECT c.id as chunk_id, c.document_id, d.title as document_title, d.source_key,
           c.content, c.page_number, c.section_title
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE d.status = 'INDEXED'
      AND c.content_tsvector @@ plainto_tsquery('english', ${query})
    ORDER BY ts_rank(c.content_tsvector, plainto_tsquery('english', ${query})) DESC
    LIMIT ${pool}
  `;
}

export async function retrieve(opts: RetrieveOptions): Promise<RetrievalResult[]> {
  const cfg = loadRagConfig();
  const topK = Math.min(opts.topK ?? cfg.retrievalTopK, RETRIEVAL_DEFAULTS.maxTopK);
  const mode = opts.mode ?? cfg.retrievalMode;

  const queryEmbedding = await embedQuery(opts.query);
  const vecRows = await vectorCandidates(queryEmbedding, cfg.vectorCandidatePool);

  if (mode === "vector") {
    return vecRows.slice(0, topK).map((row, idx) => ({
      ...rowToBase(row),
      score: row.similarity,
      vectorSimilarity: row.similarity,
      rank: idx + 1
    }));
  }

  const kwRows = await keywordCandidates(opts.query, cfg.keywordCandidatePool);

  const vectorRanked: RankedCandidate<ChunkRow & { similarity?: number }>[] = vecRows.map((row) => ({
    id: row.chunk_id,
    payload: row
  }));
  const keywordRanked: RankedCandidate<ChunkRow & { similarity?: number }>[] = kwRows.map((row) => ({
    id: row.chunk_id,
    payload: row
  }));

  const fused = reciprocalRankFusion([vectorRanked, keywordRanked]);

  return fused.slice(0, topK).map((f, idx) => ({
    ...rowToBase(f.payload),
    score: f.score,
    vectorSimilarity: f.payload.similarity,
    rank: idx + 1
  }));
}

export function toSearchResult(result: RetrievalResult): SearchResult {
  return {
    chunkId: result.chunkId,
    documentId: result.documentId,
    documentTitle: result.documentTitle,
    sourceKey: result.sourceKey,
    snippet: result.content.length > 500 ? `${result.content.slice(0, 500)}...` : result.content,
    pageNumber: result.pageNumber,
    sectionTitle: result.sectionTitle,
    score: result.score,
    rank: result.rank
  };
}
