# Lumen Playables — Internal RAG Assistant

A retrieval-augmented generation (RAG) case study built for **Lumen Playables**, a
fictional interactive-ad studio. Employees ask natural-language questions about internal
docs (SDK notes, network specs, build pipeline, incident postmortems, client briefs,
localization rules, ...) and get grounded, cited answers instead of having to grep through
a shared drive.

The system is a full pnpm/Turborepo monorepo: a Postgres + pgvector store, an ingestion
pipeline that chunks and embeds a markdown/PDF/docx corpus, a hybrid (vector + keyword)
retriever, a grounded-answer LLM layer, a Fastify API, a Next.js Chat Page + Admin
Dashboard, and an MCP server that exposes the same retrieval as a `search_corpus` tool for
other agents.

## Architecture

```
apps/
  api/    Fastify backend — auth, /api/ask, /api/search, admin endpoints, ingestion CLI
  web/    Next.js 14 (App Router) — Chat Page + Admin Dashboard
  mcp/    MCP server exposing `search_corpus` over stdio or HTTP
packages/
  db/       Drizzle ORM schema, SQL migrations, seed script, Postgres client
  rag/      Corpus loading, chunking, embeddings, hybrid retrieval, grounded answer generation
  shared/   Zod schemas / DTOs shared across api, web, mcp, evals
evals/    Standalone retrieval + answer-quality evaluation harness
corpus/   The internal document corpus that gets ingested
docker-compose.yml, Dockerfile   Single-image containerized deployment of every service
```

**Stack:** TypeScript everywhere, pnpm workspaces + Turborepo, Fastify, Next.js 14, Drizzle
ORM, Postgres 16 with `pgvector`, OpenAI (embeddings + chat completions), Zod for all
request/response validation, Vitest for unit/integration tests, Playwright for e2e.

## Data model

(`packages/db/src/schema.ts`, migrations in `packages/db/migrations/`)

| Table | Purpose |
|---|---|
| `users` | Local accounts (`USER` / `ADMIN` role), argon2id password hashes |
| `sessions` | Opaque session tokens (`id.secret` cookie; only the sha256 of the secret is stored) |
| `documents` | One row per ingested source file — `source_key`, `title`, `content_sha256`, `status` (`PENDING`/`PROCESSING`/`INDEXED`/`FAILED`/`REMOVED`) |
| `document_chunks` | Chunked text with `embedding vector(1536)`, a generated `tsvector` column for keyword search, page/section metadata |
| `ingestion_runs` / `ingestion_items` | Audit trail of every ingestion run and per-file outcome |
| `search_logs` | Every `/api/ask` and MCP `search_corpus` call — query, mode, latency, result count, top score, status |

`document_chunks.embedding` is a real `vector(EMBEDDING_DIMENSIONS)` pgvector column (custom
Drizzle type, since Drizzle has no first-party `vector` helper); `content_tsvector` is a
Postgres generated column indexed with GIN for keyword search (see
`migrations/0001_search_indexes.sql`).

## Ingestion pipeline

`packages/rag/src/ingestion/ingest.ts`, driven by `apps/api/src/cli/ingest.ts` (`pnpm ingest`)
or the admin dashboard's "Trigger ingestion" button (`POST /api/admin/ingestion`):

1. Walk `CORPUS_ROOT` (markdown, PDF, docx supported — see `packages/rag/src/loaders/`).
2. Hash each file's content (`sha256`); unchanged files are skipped, changed files are
   re-chunked and re-embedded, removed files are marked `REMOVED`.
3. Chunk by token count (`CHUNK_SIZE_TOKENS`, default 800, with `CHUNK_OVERLAP_TOKENS`
   overlap) using `tiktoken`.
4. Embed all chunks in batches via OpenAI (`EMBEDDING_MODEL`), with retry + backoff on
   429/5xx.
5. Record everything in `ingestion_runs` / `ingestion_items` for auditability, including
   partial failures (a single bad file doesn't fail the whole run).

## Retrieval & answer design

`packages/rag/src/retrieval/retrieval.ts` + `packages/rag/src/answer.ts`:

- **Hybrid retrieval**: vector similarity (pgvector cosine distance) and Postgres full-text
  keyword search each produce a candidate pool, fused with **Reciprocal Rank Fusion**
  (`retrieval/rrf.ts`). `RETRIEVAL_MODE` can be forced to `vector`, `keyword`, or `hybrid`.
- **Insufficient-context gate**: before ever calling the LLM, `hasRetrievalSignal()` checks
  the best result's score against `RETRIEVAL_MIN_SCORE` (default `0.15`). Below that, the
  system returns `status: "insufficient_context"` with zero citations and never spends an
  LLM call — this is what makes the out-of-corpus eval case free and deterministic.
- **Grounded answer generation**: retrieved chunks are numbered and passed to the chat
  model with a system prompt that:
  - forbids using any knowledge outside the provided sources,
  - requires every concrete claim to carry a bracketed `[n]` citation,
  - requires the model to say so explicitly if sources disagree or one looks outdated,
  - treats the retrieved chunk text as **untrusted content, never instructions** (explicit
    prompt-injection resistance — a chunk that says "ignore previous instructions" is just
    quoted text to reason about),
  - forbids revealing the system prompt, API keys, or absolute file paths.
  - The model responds via a strict JSON schema (`answer`, `hasSufficientContext`,
    `citedSourceIds`), so citations are structurally tied to sources actually shown to it —
    it cannot cite a document number that doesn't exist.

## API surface

All endpoints under `/api/*` except `/health/*`; served by `apps/api` (Fastify), OpenAPI
docs at `/docs` (Swagger UI) when running.

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/login` | — | Email/password login, sets session cookie |
| `POST /api/auth/logout` | session | Revokes the current session |
| `GET /api/auth/me` | — | Current user or `null` |
| `POST /api/ask` | session | Ask a question, get a grounded answer + citations |
| `POST /api/search` | session | Raw retrieval results, no LLM call |
| `GET /api/documents/:id` | session | Document detail (title, status, chunk count) |
| `GET /api/admin/documents` | admin | List/filter ingested documents |
| `GET /api/admin/documents/:id` | admin | Document detail + its chunks |
| `POST /api/admin/ingestion` | admin | Trigger a new ingestion run |
| `GET /api/admin/ingestion` / `/:id` | admin | Ingestion run history / detail |
| `GET /api/admin/stats/overview` | admin | Document/chunk counts, readiness badge |
| `GET /api/admin/stats/recent-searches` | admin | Recent `search_logs` rows |
| `GET /health/live`, `/health/ready` | — | Liveness / DB-backed readiness probe |

## Security

- Sessions are `${sessionId}.${secret}` cookies: the id is just a lookup key, the secret is
  compared against a stored sha256 hash with `timingSafeEqual` — a leaked/guessed id alone
  is useless (`apps/api/src/auth/session.ts`).
- Every login issues a brand-new session row (never reuses/extends one), preventing session
  fixation.
- Passwords hashed with argon2id (`apps/api/src/auth/password.ts`).
- CORS is an explicit allowlist from `CORS_ORIGINS`, never `*`, since it's combined with
  `credentials: true`.
- Per-route rate limiting (login and `/api/ask` have their own stricter limits on top of a
  global 200/min).
- The global error handler never leaks stack traces, DB errors, or provider internals to
  the client — only curated `ApiError` messages cross that boundary; everything else is
  logged server-side and replaced with a generic `Internal server error` in production.
- `.env` is git-ignored (`.gitignore`); `.env.example` documents every variable with no real
  secrets.
- The RAG answer prompt is explicitly hardened against prompt injection from retrieved
  document content (see above).

## Chat Page + Admin Dashboard

`apps/web` (Next.js App Router):

- **Chat Page** (`/`) — ask a question, see the grounded answer, a status badge
  (Answered / Insufficient context), inline citations linking back to source documents,
  and latency.
- **Admin Dashboard** (`/admin`, `ADMIN` role only):
  - **Overview** — document/chunk counts and a corpus readiness badge.
  - **Documents** — browse/filter ingested documents, drill into a document's chunks.
  - **Ingestion** — history of ingestion runs, trigger a new one.
  - **Recent searches** — recent `/api/ask` and MCP queries with mode, latency, and status.

## MCP `search_corpus` tool

`apps/mcp` exposes the same hybrid retriever as an MCP tool (stdio by default, HTTP with a
bearer `MCP_AUTH_TOKEN` when `MCP_TRANSPORT=http`), so any MCP-compatible agent can search
the corpus directly without going through the web UI:

```
search_corpus({ query: string, topK?: number, mode?: "vector" | "hybrid" })
  -> { results: [...], resultCount, requestId }
```

Every call is logged to `search_logs` the same way `/api/ask` is, so MCP usage shows up in
the Admin Dashboard's recent-searches view.

## Observability

- Structured JSON logging (Fastify/pino) with a `x-request-id` on every response.
- Every search (chat and MCP) is persisted to `search_logs`: query, mode, `topK`, latency,
  result count, top score, and status — this is what the Admin Dashboard's
  "recent searches" view reads from.
- Ingestion runs and per-file outcomes are persisted (`ingestion_runs` / `ingestion_items`),
  not just logged, so a bad ingest is auditable after the fact.
- `/health/live` (process up) and `/health/ready` (DB reachable) for container
  orchestration.

## Getting started (local dev)

Requires Node 22+, pnpm 9, and a Postgres instance with the `pgvector` extension (the
easiest way is `docker compose up db -d`, which uses `pgvector/pgvector:pg16`).

```bash
cp .env.example .env
# then fill in OPENAI_API_KEY and a real SESSION_SECRET

pnpm install
pnpm db:migrate
pnpm db:seed        # creates the demo admin/user accounts from .env
pnpm ingest          # embeds and indexes everything in corpus/
pnpm dev             # runs api (4000), web (3000), mcp via turbo
```

Demo accounts (see `.env` / `.env.example`): `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD`
(admin), `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` (regular user).

> **Note:** the root `package.json` scripts that shell out to `pnpm --filter ...`
> (`eval`, `ingest`, `db:migrate`, `db:seed`, `test:e2e`) require `pnpm` itself to be on
> `PATH`. If your environment only has `pnpm` reachable through `corepack pnpm`, run the
> underlying command directly, e.g. `corepack pnpm --filter evals start` instead of
> `corepack pnpm eval`.

### Docker

```bash
pnpm docker:setup
# equivalent to:
docker compose up --build -d
docker compose run --rm migrate
docker compose exec api pnpm db:seed
```

This brings up `db` (Postgres+pgvector), runs migrations once, then starts `api` (4000),
`web` (3000), and `mcp` (4100). All four services share one image (`Dockerfile`) since
every service needs the full workspace at runtime anyway (the db package's migrate/seed
scripts run via `tsx`, not compiled output). `CORPUS_ROOT` is set to the absolute
in-container path `/app/corpus` in `docker-compose.yml`, so it isn't affected by which
directory a script happens to run from.

## Environment variables

See `.env.example` for the full, commented list. Highlights:

- `OPENAI_API_KEY` / `OPENAI_BASE_URL` — required for ingestion (embeddings) and `/api/ask`
  (chat completions). `OPENAI_BASE_URL` lets you point at any OpenAI-compatible endpoint.
- `CORPUS_ROOT` — path to the document corpus. Locally this is relative to `apps/api`'s
  working directory (`pnpm --filter` runs a package's scripts from that package's own
  directory, not the repo root), hence `../../corpus`. Docker Compose overrides it to the
  absolute `/app/corpus`.
- `RETRIEVAL_MODE` / `RETRIEVAL_TOP_K` / `RETRIEVAL_MIN_SCORE` — tune hybrid retrieval and
  the insufficient-context threshold.
- `SESSION_SECRET` — must be at least 32 characters; only used as a config sanity check
  today (session tokens are random, not HMAC'd by this secret), but treat it as a real
  secret regardless.
- `MCP_TRANSPORT` / `MCP_PORT` / `MCP_AUTH_TOKEN` — MCP server transport; `MCP_AUTH_TOKEN`
  is required when `MCP_TRANSPORT=http`.

## Testing

```bash
pnpm test        # turbo run test — vitest across packages/rag, packages/shared, apps/api, apps/mcp
pnpm test:e2e     # Playwright e2e for apps/web (mocks apps/api's HTTP surface, no live backend needed)
pnpm typecheck    # turbo run typecheck
pnpm lint         # turbo run lint
```

- `packages/rag` — chunking, tokenizer, hashing, retrieval fusion, and the full grounded
  `answerQuestion` flow (mocked OpenAI/DB).
- `packages/shared` — every Zod schema round-trips valid/invalid payloads.
- `apps/api` — route-level integration tests (auth guards, ask/search, admin CRUD,
  ingestion trigger, stats) against a real Postgres test database.
- `apps/mcp` — `search_corpus` tool logic and both transports.
- `apps/web` — Playwright e2e for login, chat (answered + insufficient-context), and the
  full admin flow (overview, documents, ingestion trigger), with `apps/api` mocked at the
  HTTP layer via `page.route()` so these run without a live backend.

## Evaluation

`evals/` is a standalone retrieval + answer-quality harness that calls
`answerQuestion()` directly (bypassing HTTP/auth), so it exercises the real retrieval +
grounded-answer path end to end against whatever corpus is currently ingested.

```bash
pnpm ingest    # make sure the corpus is indexed first
corepack pnpm --filter evals start   # or: pnpm eval, if pnpm is on PATH
```

The dataset (`evals/src/dataset.ts`) is exactly the 6 cases from `sample_questions.md`: the
5 sample questions (each asserting the expected document was retrieved *and cited*, plus a
substring check that the SDK question's answer actually calls out the v2→v3 deprecation)
and the required out-of-corpus case (asserting `status: "insufficient_context"` and zero
citations — never an invented one). It's designed to be extended with a private set in the
same shape; the runner (`evals/src/run.ts`) doesn't hardcode anything about these specific
questions. It prints a per-case pass/fail with the retrieved vs. cited documents, a summary,
and exits non-zero if anything fails, so it's CI-usable as a regression gate.

## Known limitations

- No automated re-ranker beyond RRF fusion; retrieval quality depends on chunk size/overlap
  tuning for very long documents.
- The evals harness checks retrieval + citation correctness and targeted answer substrings;
  it does not run a full LLM-judge style scoring pass over free-form answer quality.
- `SESSION_SECRET` is validated for length but not currently used to sign anything (session
  secrets are randomly generated per-session, not derived from it).
