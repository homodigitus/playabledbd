# Single shared image for all Node.js services (api, mcp, web, db migrate/seed).
#
# This case study favors one correctness-first image over four hand-slimmed ones: every
# service needs the full pnpm workspace at runtime anyway (the db package's migrate/seed
# scripts run via `pnpm ... tsx`, not compiled output), so splitting images would just
# duplicate the same install+build without shrinking anything that matters here.

FROM node:22-bookworm-slim AS base

# python3/make/g++ let argon2 (native module) build from source if no prebuilt binary
# matches this exact glibc/node ABI; wget is used by the compose healthcheck.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ wget ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mcp/package.json apps/mcp/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/rag/package.json packages/rag/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Baked into the web app's client bundle at build time (Next.js public env var contract).
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN corepack pnpm exec turbo run build

FROM build AS runtime
# NODE_ENV=development on purpose: this compose stack serves plain HTTP on localhost with
# no TLS-terminating proxy in front, and the api marks session cookies Secure only when
# NODE_ENV=production (see apps/api/src/config.ts) -- Secure cookies are dropped by browsers
# over non-HTTPS, which would silently break login. Deploying behind real TLS should flip
# this to production and terminate TLS at a reverse proxy.
ENV NODE_ENV=development
EXPOSE 3000 4000 4100
CMD ["node", "apps/api/dist/index.js"]
