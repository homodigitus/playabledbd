import { getDb, searchLogs } from "@lumen/db";

export async function logMcpSearch(params: {
  principal: string;
  query: string;
  retrievalMode: string;
  topK: number;
  latencyMs: number;
  resultCount: number;
  topScore: number | null;
  answerStatus: string;
}): Promise<void> {
  const db = getDb();
  await db.insert(searchLogs).values({
    userId: null,
    principal: params.principal,
    query: params.query,
    retrievalMode: params.retrievalMode,
    topK: params.topK,
    latencyMs: Math.round(params.latencyMs),
    resultCount: params.resultCount,
    topScore: params.topScore,
    answerStatus: params.answerStatus
  });
}
