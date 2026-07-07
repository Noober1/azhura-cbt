# syntax=docker/dockerfile:1
#
# Admin/supervisor console image — static SPA (Vite + React) served by nginx.
#
# IMPORTANT: build context MUST be the repo ROOT (Bun-workspaces monorepo with a
# single root bun.lock + the `@azhura/shared` workspace dependency). The compose
# service sets `context: .` with `dockerfile: apps/console/Dockerfile`.
#
# This image is a PURE STATIC FILE SERVER. It does NOT reverse-proxy the API.
# The console talks to the backend directly over the LAN on :3000 (configured at
# build/deploy time via the console's VITE_API_BASE_URL). Pinned bases (NOT
# :latest) for reproducible builds.

# ---- build: install workspace + produce apps/console/dist ----
FROM oven/bun:1.2-alpine AS build
WORKDIR /app

# Workspace manifests first for layer caching.
COPY package.json bun.lock ./
COPY apps/console/package.json ./apps/console/
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/
COPY apps/student/package.json ./apps/student/
COPY apps/e2e/package.json ./apps/e2e/

RUN bun install --frozen-lockfile

# Source needed to build the console: the console app + the shared package.
COPY apps/console ./apps/console
COPY packages/shared ./packages/shared

# The console SPA reads VITE_API_BASE_URL at BUILD time (Vite inlines
# import.meta.env into the bundle). This MUST point at the backend's LAN origin
# (:3000), not the console origin (:80). The default below is a dev placeholder;
# production overrides it via `docker compose build --build-arg`/compose `args:`
# so the school's LAN IP is baked into the static bundle. See docs/DEPLOY.md.
ARG VITE_API_BASE_URL=http://localhost:3000/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Build only the console workspace → apps/console/dist (tsc && vite build).
RUN bun --filter azhura-console build

# ---- runtime: nginx serving the static bundle ----
FROM nginx:1.27-alpine AS runtime

# Replace the default site config with our SPA + security-header config.
COPY apps/console/nginx.conf /etc/nginx/conf.d/default.conf

# Ship the built SPA.
COPY --from=build /app/apps/console/dist /usr/share/nginx/html

# nginx:alpine's master process binds :80 and needs root to do so, then drops to
# the unprivileged `nginx` user for workers (default behaviour). We keep the
# stock entrypoint/user model: master as root, workers unprivileged. Switching
# to a fully rootless nginx would require an unprivileged port (e.g. 8080) and
# extra config; out of scope for a LAN appliance behind a firewall. EXPOSE 80
# documents the served port.
EXPOSE 80

# Default nginx CMD (daemon off) from the base image is used as-is.
