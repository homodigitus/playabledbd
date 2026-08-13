/** Strip control noise from extracted text without altering its meaning: null bytes (can appear
 * from bad encodings/binary leakage), CRLF variance, trailing whitespace, and runaway blank lines. */
export function normalizeText(raw: string): string {
  const NULL_BYTE = String.fromCharCode(0);
  return raw
    .split(NULL_BYTE)
    .join("")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}
