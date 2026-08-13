import { promises as fs } from "node:fs";
import { extname, join, relative, sep } from "node:path";

export type DiscoveredFile = { absolutePath: string; sourceKey: string };

/** Recursively lists files under `root`, resolving symlinks and rejecting any entry whose real
 * path would land outside `root` — the only path-traversal boundary that matters once `root`
 * itself has been chosen by a trusted caller (see ingestion.ts for who is allowed to set it). */
export async function walkCorpusFiles(root: string): Promise<DiscoveredFile[]> {
  const resolvedRoot = await fs.realpath(root);
  const out: DiscoveredFile[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const candidatePath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(candidatePath);
        continue;
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;

      let real: string;
      try {
        real = await fs.realpath(candidatePath);
      } catch {
        continue;
      }
      const withinRoot = real === resolvedRoot || real.startsWith(resolvedRoot + sep);
      if (!withinRoot) continue;

      const sourceKey = relative(resolvedRoot, real).split(sep).join("/");
      out.push({ absolutePath: real, sourceKey });
    }
  }

  await walk(resolvedRoot);
  return out.sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
}

export function mimeTypeForExtension(fileName: string): string {
  switch (extname(fileName).toLowerCase()) {
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "application/octet-stream";
  }
}
