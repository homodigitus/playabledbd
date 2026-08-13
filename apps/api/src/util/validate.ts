import type { z, ZodTypeAny } from "zod";
import { ApiError } from "@lumen/shared";

export function parseOrThrow<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid request", result.error.flatten());
  }
  return result.data;
}
