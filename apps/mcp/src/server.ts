import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiError } from "@lumen/shared";
import { SEARCH_CORPUS_TOOL_NAME, runSearchCorpus, searchCorpusInputShape } from "./search-corpus.js";

export function buildMcpServer(principal: string): McpServer {
  const server = new McpServer({
    name: "lumen-playables-rag",
    version: "0.1.0"
  });

  server.registerTool(
    SEARCH_CORPUS_TOOL_NAME,
    {
      title: "Search Lumen Playables corpus",
      description:
        "Retrieves the most relevant indexed document chunks for a natural-language query, using vector " +
        "or hybrid (vector + keyword) search over the Lumen Playables knowledge corpus. Returns chunk " +
        "content with source document, page/section, and relevance score — use this to ground answers " +
        "in the corpus rather than guessing.",
      inputSchema: searchCorpusInputShape
    },
    async (args) => {
      try {
        const output = await runSearchCorpus(args, principal);
        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }]
        };
      } catch (err) {
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Search failed";
        return {
          isError: true,
          content: [{ type: "text", text: message }]
        };
      }
    }
  );

  return server;
}
