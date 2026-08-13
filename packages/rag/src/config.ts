import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { RETRIEVAL_MODES } from "@lumen/shared";

// Anchored to this file's own location (not process.cwd()) so OPENAI_API_KEY etc. still load
// correctly when this package is invoked with a different working directory, e.g. via
// `pnpm --filter <pkg> <script>`, which runs with cwd set to that package's own directory.
loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const ragConfigSchema = z.object({
  corpusRoot: z.string().min(1),
  chunkSizeTokens: z.coerce.number().int().min(50).max(4000),
  chunkOverlapTokens: z.coerce.number().int().min(0).max(1000),
  retrievalMode: z.enum(RETRIEVAL_MODES),
  retrievalTopK: z.coerce.number().int().min(1).max(10),
  retrievalMinScore: z.coerce.number().min(0).max(1),
  vectorCandidatePool: z.coerce.number().int().min(1).max(100),
  keywordCandidatePool: z.coerce.number().int().min(1).max(100),
  embeddingModel: z.string().min(1),
  embeddingDimensions: z.coerce.number().int().min(1),
  chatModel: z.string().min(1),
  openaiApiKey: z.string().optional(),
  openaiBaseUrl: z.string().optional()
});

export type RagConfig = z.infer<typeof ragConfigSchema>;

let cached: RagConfig | undefined;

export function loadRagConfig(env: NodeJS.ProcessEnv = process.env): RagConfig {
  if (cached) return cached;

  const parsed = ragConfigSchema.safeParse({
    corpusRoot: env.CORPUS_ROOT ?? "./corpus",
    chunkSizeTokens: env.CHUNK_SIZE_TOKENS ?? "800",
    chunkOverlapTokens: env.CHUNK_OVERLAP_TOKENS ?? "120",
    retrievalMode: env.RETRIEVAL_MODE ?? "hybrid",
    retrievalTopK: env.RETRIEVAL_TOP_K ?? "5",
    retrievalMinScore: env.RETRIEVAL_MIN_SCORE ?? "0.15",
    vectorCandidatePool: env.VECTOR_CANDIDATE_POOL ?? "20",
    keywordCandidatePool: env.KEYWORD_CANDIDATE_POOL ?? "20",
    embeddingModel: env.EMBEDDING_MODEL ?? "text-embedding-3-small",
    embeddingDimensions: env.EMBEDDING_DIMENSIONS ?? "1536",
    chatModel: env.CHAT_MODEL ?? "gpt-4.1-mini",
    openaiApiKey: env.OPENAI_API_KEY,
    openaiBaseUrl: env.OPENAI_BASE_URL
  });

  if (!parsed.success) {
    throw new Error(`Invalid RAG configuration: ${parsed.error.message}`);
  }

  cached = parsed.data;
  return cached;
}

export function resetRagConfigCacheForTests(): void {
  cached = undefined;
}
