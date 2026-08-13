# AI Usage

This repository was built end-to-end by an AI coding agent (Claude Code, running Claude
Sonnet 5) from a single detailed specification, with no other code written by hand. This
document describes how, so a reviewer can judge what to trust and what to double-check.

## Process

The agent worked in small, verifiable stages, one package/app at a time, in roughly this
order: monorepo scaffold → shared schemas → db layer → RAG core (chunking/embeddings/
retrieval/answer) → API → web frontend → MCP server → Docker → tests → evals → docs. After
each stage it ran `typecheck`, `lint`, and the relevant test suite for the packages it had
just touched, and did not move on until those passed for real — no step was marked done
based on code that "should work."

Concretely, "verified" in this repo means a tool was actually invoked and its real output
observed in that same turn:

- `tsc --noEmit` for every touched package
- `eslint` for every touched package
- `vitest run` for `packages/rag`, `packages/shared`, `apps/api`, `apps/mcp`
- `playwright test` for `apps/web` (mocking `apps/api`'s HTTP surface, no live backend)
- A real, non-mocked run of `pnpm ingest` against the actual `corpus/` directory and a real
  Postgres instance, followed by a direct SQL check that documents/chunks/embeddings
  actually landed in the database
- A real, non-mocked run of `evals/` — actual OpenAI embedding and chat-completion calls
  against the ingested corpus, not stubbed responses

## Where a human was required

The agent cannot obtain third-party credentials on its own. `OPENAI_API_KEY` was empty in
`.env` throughout initial development (mocked tests don't need it), which meant real
ingestion and real evals could not run. The agent explicitly flagged this rather than
faking a passing eval result, and a human supplied a real OpenAI API key mid-session so
ingestion and evals could be run for real. The key was written directly to the git-ignored
`.env` file and was never printed, logged, or included in any command output.

## Bugs the agent found and fixed in its own output

Two environment-dependent bugs were discovered only once real (non-mocked) execution was
attempted, and were fixed at the root cause rather than worked around:

1. **`dotenv` resolving against the wrong working directory.** `import "dotenv/config"`
   resolves `.env` relative to `process.cwd()`. Because `pnpm --filter <pkg> <script>` runs
   a package's scripts from that package's own directory (not the repo root), six files
   silently failed to load the root `.env` when invoked that way. Fixed by anchoring each
   `dotenv.config({ path })` call to the file's own on-disk location via `import.meta.url`
   instead of relying on `process.cwd()`.
2. **`CORPUS_ROOT` being a `process.cwd()`-relative path itself.** Even after fixing (1),
   `CORPUS_ROOT=./corpus` resolved against `apps/api`'s directory instead of the repo root
   for the same reason. Fixed by changing the local value to `../../corpus` (Docker Compose
   was unaffected — it already set an absolute `/app/corpus`).

Both were caught by actually running ingestion against real data, not by inspection —
illustrating why the agent's live verification loop (rather than trusting compiled/typed
code alone) mattered here.

## What this means for review

- Every claim of "N/N tests pass" or "ingestion succeeded" in this repo's history reflects
  a command that was actually run in that turn; commands are also described inline in this
  file and in the README so they can be re-run and independently confirmed.
- Code review should still happen as normal — an AI agent following a spec is not a
  substitute for a second pair of eyes, particularly around the security-sensitive pieces
  (session handling, CORS, error sanitization) called out in the README's Security section.
- No secrets, API keys, or corpus content were committed to git; `.env` is git-ignored and
  `.env.example` contains no real values.

## Post-generation review session

After the repository above was generated, the developer (Murat) ran an independent review
session with a separate AI assistant (Claude, in a chat interface — not the coding agent
that built the repo). This was a genuine second pair of eyes, not a rubber stamp: the
assistant had no prior context on this codebase and re-derived everything from the code and
from commands actually executed, catching two real gaps the original build had missed.

What was checked and found:

- **`pnpm install`, `pnpm typecheck`, and `pnpm test` were re-run from scratch** on the
  developer's machine (Windows, via `npx pnpm@9.15.0` to match the pinned `packageManager`
  version) to confirm the repo builds and tests pass outside the environment it was
  generated in, not just inside it.
- **`packages/db` had a `test` script but zero test files**, which made the root-level
  `pnpm test` fail even though every other package's own tests passed. This was a real gap
  in the original build's "all tests pass" claim. Fixed by adding
  `packages/db/src/schema.test.ts` — schema-shape sanity checks (tables and
  auth/ingestion-critical columns exist by name) that don't require a live database.
- **Vector retrieval was specifically stress-tested**, not just trusted: queries phrased
  with zero word-overlap with the corpus (e.g. asking about network calls "during review"
  instead of "outbound requests"/"QA bot") were used to distinguish real semantic retrieval
  from keyword luck. Some overly oblique phrasings correctly triggered
  `insufficient_context` (the `RETRIEVAL_MIN_SCORE` gate working as intended, not a bug);
  moderately-paraphrased and vector-only-mode queries succeeded, confirming embeddings are
  genuinely doing semantic work rather than the retrieval quality being an artifact of
  keyword overlap.
- **The MCP server was tested with three independent clients** — raw `curl` (JSON-RPC
  `initialize` over Streamable HTTP), MCP Inspector, and a purpose-built script
  (`scripts/test-mcp-client.ts`) using the real `@modelcontextprotocol/sdk` client. `curl`
  and the SDK script both succeeded immediately and returned correct, cited results.
  Inspector hung on "Connecting…" — investigating this (browser DevTools Network tab,
  container logs) found the HTTP transport had **no CORS handling at all**: any non-POST
  request, including the preflight `OPTIONS` that browsers send before a POST carrying a
  custom header, got a bare `405` with no `Access-Control-*` headers, which silently blocks
  browser-based clients while leaving non-browser clients (curl, server-side SDKs)
  unaffected — exactly the symptom observed. Fixed in `apps/mcp/src/transports/http.ts`
  (explicit `OPTIONS` handling + CORS headers on every response), with two new tests
  (`http-server.test.ts`) covering the preflight and the header presence on a real request.
  After the fix, `search_corpus` was confirmed working end-to-end via the SDK script against
  the live Docker Compose stack, returning real, correctly-ranked, correctly-cited corpus
  results.
- Two documentation gaps were closed: the README didn't mention that MCP Inspector's
  browser proxy can hang on this transport (now documented, with the SDK script offered as
  a faster way to verify), and it didn't warn that `.env.example`'s `MCP_AUTH_TOKEN`
  placeholder is accepted as a working (if public) token as-is rather than needing a
  format change — both now called out.

Nothing above contradicts the original build's own AI_USAGE.md claims; the ingestion,
auth, and hybrid-retrieval-with-RRF claims all held up under independent re-testing. The
two things this pass changed (`packages/db` test coverage, MCP CORS) were real gaps that
straightforward automated testing didn't catch on the first pass — the `db` gap because a
missing test *file* doesn't fail typecheck or lint, and the CORS gap because every
automated test used a non-browser HTTP client (`fetch`, `curl`), so nothing in the original
test suite exercised a browser's preflight behavior.
