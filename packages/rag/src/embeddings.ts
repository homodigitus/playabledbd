import OpenAI from "openai";
import { loadRagConfig } from "./config.js";

let client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!client) {
    const cfg = loadRagConfig();
    client = new OpenAI({
      apiKey: cfg.openaiApiKey && cfg.openaiApiKey.length > 0 ? cfg.openaiApiKey : "missing-api-key",
      baseURL: cfg.openaiBaseUrl && cfg.openaiBaseUrl.length > 0 ? cfg.openaiBaseUrl : undefined
    });
  }
  return client;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): boolean {
  const status = (err as { status?: number } | undefined)?.status;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  if (err instanceof Error && /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(err.message)) {
    return true;
  }
  return false;
}

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 400;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (!isRetryableError(err) || attempt > MAX_RETRIES) throw err;
      const jitter = Math.random() * BASE_DELAY_MS;
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1) + jitter;
      await sleep(delay);
    }
  }
}

const EMBEDDING_BATCH_SIZE = 64;

/** Batches embedding calls and retries transient (429/5xx/network) failures with backoff + jitter,
 * so a single ingestion run doesn't die because of a momentary rate limit. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const cfg = loadRagConfig();
  const openai = getClient();
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const response = await withRetry(() =>
      openai.embeddings.create({ model: cfg.embeddingModel, input: batch })
    );
    for (const item of response.data) {
      results.push(item.embedding);
    }
  }

  return results;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  if (!vector) throw new Error("Embedding provider returned no vector for query");
  return vector;
}

export { getClient as getOpenAiClient, withRetry as withOpenAiRetry };
