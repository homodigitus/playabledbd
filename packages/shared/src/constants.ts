export const USER_ROLES = ["USER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DOCUMENT_STATUSES = ["PENDING", "PROCESSING", "INDEXED", "FAILED", "REMOVED"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const INGESTION_RUN_STATUSES = ["QUEUED", "RUNNING", "SUCCEEDED", "PARTIAL", "FAILED"] as const;
export type IngestionRunStatus = (typeof INGESTION_RUN_STATUSES)[number];

export const INGESTION_ITEM_STATUSES = [
  "PENDING",
  "INDEXED",
  "UNCHANGED",
  "SKIPPED_UNSUPPORTED",
  "FAILED",
  "REMOVED"
] as const;
export type IngestionItemStatus = (typeof INGESTION_ITEM_STATUSES)[number];

export const RETRIEVAL_MODES = ["vector", "hybrid"] as const;
export type RetrievalMode = (typeof RETRIEVAL_MODES)[number];

export const ANSWER_STATUSES = ["ANSWERED", "INSUFFICIENT_CONTEXT", "ERROR"] as const;
export type AnswerLogStatus = (typeof ANSWER_STATUSES)[number];

export const ASK_RESPONSE_STATUSES = ["answered", "insufficient_context"] as const;
export type AskResponseStatus = (typeof ASK_RESPONSE_STATUSES)[number];

export const RETRIEVAL_DEFAULTS = {
  topK: 5,
  maxTopK: 10,
  vectorCandidatePool: 20,
  keywordCandidatePool: 20
} as const;

export const SUPPORTED_EXTENSIONS = [".txt", ".md", ".pdf", ".docx"] as const;

export const MAX_INGEST_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB safety limit per source file
