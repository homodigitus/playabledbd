import { describe, expect, it, vi, beforeEach } from "vitest";

const retrieveMock = vi.fn();
const loadRagConfigMock = vi.fn();
const logMcpSearchMock = vi.fn();

vi.mock("@lumen/rag", () => ({
  retrieve: retrieveMock,
  loadRagConfig: loadRagConfigMock
}));

vi.mock("./search-log.js", () => ({
  logMcpSearch: logMcpSearchMock
}));

const { runSearchCorpus, SEARCH_CORPUS_TOOL_NAME, searchCorpusInputShape } = await import("./search-corpus.js");

function fakeResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    chunkId: "11111111-1111-1111-1111-111111111111",
    documentId: "22222222-2222-2222-2222-222222222222",
    documentTitle: "Client Brief",
    sourceKey: "client-briefs/brief-1.md",
    pageNumber: undefined,
    sectionTitle: "Overview",
    content: "Some indexed chunk content.",
    score: 0.87,
    rank: 1,
    ...overrides
  };
}

describe("runSearchCorpus", () => {
  beforeEach(() => {
    retrieveMock.mockReset();
    loadRagConfigMock.mockReset();
    logMcpSearchMock.mockReset();
    loadRagConfigMock.mockReturnValue({ retrievalMode: "hybrid" });
  });

  it("maps retrieval results into the McpSearchOutput shape", async () => {
    retrieveMock.mockResolvedValue([fakeResult()]);

    const output = await runSearchCorpus({ query: "what is the delivery timeline" }, "mcp:stdio");

    expect(output.resultCount).toBe(1);
    expect(output.results).toHaveLength(1);
    expect(output.results[0]).toMatchObject({
      chunkId: "11111111-1111-1111-1111-111111111111",
      documentId: "22222222-2222-2222-2222-222222222222",
      documentTitle: "Client Brief",
      sourceKey: "client-briefs/brief-1.md",
      sectionTitle: "Overview",
      content: "Some indexed chunk content.",
      score: 0.87,
      rank: 1
    });
    expect(typeof output.requestId).toBe("string");
    expect(output.requestId.length).toBeGreaterThan(0);
  });

  it("passes query/topK/mode through to retrieve", async () => {
    retrieveMock.mockResolvedValue([]);

    await runSearchCorpus({ query: "onboarding steps", topK: 3, mode: "vector" }, "mcp:http");

    expect(retrieveMock).toHaveBeenCalledWith({ query: "onboarding steps", topK: 3, mode: "vector" });
  });

  it("falls back to the configured retrieval mode when mode is omitted, for logging", async () => {
    retrieveMock.mockResolvedValue([fakeResult()]);
    loadRagConfigMock.mockReturnValue({ retrievalMode: "vector" });

    await runSearchCorpus({ query: "network spec ports" }, "mcp:stdio");

    expect(logMcpSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({ retrievalMode: "vector", principal: "mcp:stdio" })
    );
  });

  it("logs resultCount 0 and INSUFFICIENT_CONTEXT when nothing is retrieved", async () => {
    retrieveMock.mockResolvedValue([]);

    const output = await runSearchCorpus({ query: "nonexistent topic entirely" }, "mcp:stdio");

    expect(output.resultCount).toBe(0);
    expect(output.results).toEqual([]);
    expect(logMcpSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({ resultCount: 0, topScore: null, answerStatus: "INSUFFICIENT_CONTEXT" })
    );
  });

  it("logs ANSWERED with the top result's score when results are found", async () => {
    retrieveMock.mockResolvedValue([fakeResult({ score: 0.42, rank: 1 }), fakeResult({ score: 0.1, rank: 2 })]);

    await runSearchCorpus({ query: "style guide colors" }, "mcp:stdio");

    expect(logMcpSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({ resultCount: 2, topScore: 0.42, answerStatus: "ANSWERED" })
    );
  });

  it("uses topK from args when provided, otherwise falls back to the result count for logging", async () => {
    retrieveMock.mockResolvedValue([fakeResult(), fakeResult({ rank: 2 })]);

    await runSearchCorpus({ query: "qa checklist items", topK: 5 }, "mcp:stdio");
    expect(logMcpSearchMock).toHaveBeenCalledWith(expect.objectContaining({ topK: 5 }));

    logMcpSearchMock.mockClear();
    retrieveMock.mockResolvedValue([fakeResult()]);
    await runSearchCorpus({ query: "qa checklist items" }, "mcp:stdio");
    expect(logMcpSearchMock).toHaveBeenCalledWith(expect.objectContaining({ topK: 1 }));
  });

  it("exposes the expected tool name and input shape keys", () => {
    expect(SEARCH_CORPUS_TOOL_NAME).toBe("search_corpus");
    expect(Object.keys(searchCorpusInputShape).sort()).toEqual(["mode", "query", "topK"].sort());
  });

  it("propagates a retrieve() rejection without logging", async () => {
    retrieveMock.mockRejectedValue(new Error("embedding provider unavailable"));

    await expect(runSearchCorpus({ query: "guides localization" }, "mcp:stdio")).rejects.toThrow(
      "embedding provider unavailable"
    );
    expect(logMcpSearchMock).not.toHaveBeenCalled();
  });
});
