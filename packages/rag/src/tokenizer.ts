import { get_encoding, type Tiktoken } from "tiktoken";

const ENCODING_BY_MODEL: Record<string, "cl100k_base" | "o200k_base"> = {
  "text-embedding-3-small": "cl100k_base",
  "text-embedding-3-large": "cl100k_base",
  "text-embedding-ada-002": "cl100k_base",
  "gpt-4.1": "o200k_base",
  "gpt-4.1-mini": "o200k_base",
  "gpt-4.1-nano": "o200k_base",
  "gpt-4o": "o200k_base",
  "gpt-4o-mini": "o200k_base"
};

const encoderCache = new Map<string, Tiktoken>();

function getEncoder(model: string): Tiktoken {
  const encodingName = ENCODING_BY_MODEL[model] ?? "cl100k_base";
  let encoder = encoderCache.get(encodingName);
  if (!encoder) {
    encoder = get_encoding(encodingName);
    encoderCache.set(encodingName, encoder);
  }
  return encoder;
}

export function countTokens(text: string, model: string): number {
  if (text.length === 0) return 0;
  const encoder = getEncoder(model);
  return encoder.encode(text).length;
}

export function encodeTokens(text: string, model: string): Uint32Array {
  return getEncoder(model).encode(text);
}

export function decodeTokens(tokens: Uint32Array | number[], model: string): string {
  const encoder = getEncoder(model);
  const arr = tokens instanceof Uint32Array ? tokens : Uint32Array.from(tokens);
  return new TextDecoder().decode(encoder.decode(arr));
}
