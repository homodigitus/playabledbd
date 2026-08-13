import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mimeTypeForExtension, walkCorpusFiles } from "./walk.js";

describe("mimeTypeForExtension", () => {
  it.each([
    ["doc.md", "text/markdown"],
    ["doc.MD", "text/markdown"],
    ["doc.txt", "text/plain"],
    ["doc.pdf", "application/pdf"],
    ["doc.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["doc.png", "application/octet-stream"],
    ["doc", "application/octet-stream"]
  ])("returns the correct mime type for %s", (fileName, expected) => {
    expect(mimeTypeForExtension(fileName)).toBe(expected);
  });
});

describe("walkCorpusFiles", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  });

  async function makeTempCorpus(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "rag-walk-test-"));
    tempDirs.push(dir);
    return dir;
  }

  it("lists nested files, skips dotfiles/dot-directories, and returns sorted posix-style relative sourceKeys", async () => {
    const root = await makeTempCorpus();
    await writeFile(join(root, "b.txt"), "b");
    await writeFile(join(root, "a.md"), "a");
    await writeFile(join(root, ".gitkeep"), "");
    await mkdir(join(root, "sub"), { recursive: true });
    await writeFile(join(root, "sub", "c.txt"), "c");
    await mkdir(join(root, ".hidden"), { recursive: true });
    await writeFile(join(root, ".hidden", "d.txt"), "d");

    const files = await walkCorpusFiles(root);
    const sourceKeys = files.map((f) => f.sourceKey);

    expect(sourceKeys).toEqual(["a.md", "b.txt", "sub/c.txt"]);
  });

  it("returns an empty array for an empty directory", async () => {
    const root = await makeTempCorpus();
    expect(await walkCorpusFiles(root)).toEqual([]);
  });

  it("returns an absolutePath alongside the relative sourceKey", async () => {
    const root = await makeTempCorpus();
    await writeFile(join(root, "only.txt"), "content");

    const files = await walkCorpusFiles(root);

    expect(files).toHaveLength(1);
    expect(files[0]!.sourceKey).toBe("only.txt");
    expect(files[0]!.absolutePath.endsWith("only.txt")).toBe(true);
  });
});
