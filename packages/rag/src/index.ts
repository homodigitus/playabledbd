export { loadRagConfig, resetRagConfigCacheForTests, type RagConfig } from "./config.js";
export { countTokens, encodeTokens, decodeTokens } from "./tokenizer.js";
export { sha256Hex } from "./hashing.js";

export { normalizeText } from "./loaders/normalize.js";
export {
  isSupportedExtension,
  loadDocument,
  titleFromFileName,
  type LoadedBlock,
  type LoadedDocument
} from "./loaders/index.js";

export { chunkDocument, type ChunkDraft, type ChunkOptions } from "./chunking/chunker.js";

export { reciprocalRankFusion, type RankedCandidate, type FusedResult } from "./retrieval/rrf.js";
export { retrieve, toSearchResult, type RetrievalResult, type RetrieveOptions } from "./retrieval/retrieval.js";

export {
  answerQuestion,
  INSUFFICIENT_CONTEXT_MESSAGE,
  sanitizeCitationMarkers,
  buildQuote,
  type AnswerResult
} from "./answer.js";

export {
  embedTexts,
  embedQuery,
  getOpenAiClient,
  withOpenAiRetry
} from "./embeddings.js";

export { walkCorpusFiles, mimeTypeForExtension, type DiscoveredFile } from "./ingestion/walk.js";
export { sanitizeErrorMessage } from "./ingestion/sanitize.js";
export {
  runIngestion,
  IngestionConflictError,
  type RunIngestionOptions,
  type IngestionRunSummary
} from "./ingestion/ingest.js";
