const SECRET_LIKE_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})/gi;

/** Keeps error messages we persist to the DB/logs useful for debugging without ever leaking API
 * keys or bearer tokens that might appear inside a raw provider error string. */
export function sanitizeErrorMessage(message: string): string {
  const redacted = message.replace(SECRET_LIKE_PATTERN, "[redacted]");
  return redacted.length > 500 ? `${redacted.slice(0, 500)}...` : redacted;
}
