# syntax=docker/dockerfile:1
#
# Backend image — Elysia + Bun API (azhura-exam-backend).
#
# IMPORTANT: build context MUST be the repo ROOT, not backend/.
# This is a Bun-workspaces monorepo with a single root lockfile (bun.lock) and
# a workspace dependency `@azhura/shared`. Installing from anywhere other than
# the root would miss the lockfile + the shared package. The matching
# docker-compose service therefore sets `context: .` with
# `dockerfile: backend/Dockerfile`.
#
# Pinned base (NOT :latest) for reproducible builds.

# ---- deps: install the full workspace with the frozen root lockfile ----
FROM oven/bun:1.2-alpine AS deps
WORKDIR /app

# Copy the workspace manifests first for better layer caching. The lockfile and
# the root package.json define the workspace graph; the per-package manifests
# let Bun resolve `workspace:*` links without copying source yet.
COPY package.json bun.lock ./
COPY backend/package.json ./backend/
COPY packages/shared/package.json ./packages/shared/

# Bring in the rest of the workspace package manifests so `bun install` can
# resolve the full workspace graph (apps/* are workspaces too). Source is added
# in the runtime stage; only manifests are needed to install.
COPY apps/console/package.json ./apps/console/
COPY apps/student/package.json ./apps/student/

# `--frozen-lockfile` fails the build if bun.lock is out of sync — a safety net.
RUN bun install --frozen-lockfile

# ---- runtime: lean image that runs migrations then the server ----
FROM oven/bun:1.2-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Carry over the resolved node_modules (root + hoisted workspace links).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# Application source. Only the packages the backend actually needs at runtime:
# the backend itself and the shared package it imports.
COPY backend ./backend
COPY packages/shared ./packages/shared

# Persisted, writable runtime dirs. `uploads/` holds user-uploaded media and is
# mounted as a Docker volume in compose; `logs/` is winston output. Both are
# resolved relative to the backend working dir (see src/index.ts → ./uploads).
# Create them up front and hand ownership to the non-root user.
RUN mkdir -p /app/backend/uploads /app/backend/logs \
  && chown -R bun:bun /app/backend/uploads /app/backend/logs

# Entrypoint runs migrations (idempotent) then starts the server. Kept inline to
# avoid shipping an extra script file; cwd is /app/backend so ./uploads + ./logs
# resolve correctly and the backend package scripts/relative paths line up.
WORKDIR /app/backend

# Drop privileges. `bun` is a pre-created non-root user in the official image.
USER bun

EXPOSE 3000

# `migrate` applies pending schema changes (safe to re-run); `start` launches
# the Elysia server. Using `bun run` so package.json scripts resolve.
ENTRYPOINT ["sh", "-c", "bun run src/migrate.ts && exec bun run src/index.ts"]
