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
