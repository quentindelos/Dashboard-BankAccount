# syntax=docker/dockerfile:1

# Multi-stage build. Works unmodified on both amd64 (dev machine / GCP) and
# arm64 (Raspberry Pi) when built with `docker buildx build --platform ...`.

FROM node:22-alpine AS base
# Prisma's SQLite query engine needs openssl on musl (Alpine) systems.
RUN apk add --no-cache openssl

# ---- deps: install once, reused by builder and runner -------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# The postinstall hook runs `prisma generate`, which needs the schema present.
COPY prisma ./prisma
# The lockfile doesn't record which Next.js compiler (SWC) build targets glibc
# and which targets musl, so npm may install only the glibc one, which can't
# load on Alpine ("__res_init: symbol not found") and makes `next build`
# fail. Add the musl build for this CPU and Next.js version when missing.
RUN npm ci \
 && if ! node -e "require('@next/swc-linux-' + process.arch + '-musl')" 2>/dev/null; then \
      npm install --no-save "@next/swc-linux-$(node -p process.arch)-musl@$(node -p "require('next/package.json').version")"; \
    fi

# ---- builder: compile the Next.js app ------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time env: no real secrets needed, Next.js just needs *something*
# present to pass the validation in src/lib/session.ts while it evaluates
# pages at build time. Real secrets are provided at container runtime.
ENV SESSION_SECRET="build-time-placeholder-not-used-at-runtime-00000000"
ENV DATABASE_URL="file:./build-placeholder.db"
# public/ may be empty (not tracked by git), but the runner stage copies it.
RUN mkdir -p public && npm run build

# ---- runner: production-only image ---------------------------------------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY prisma ./prisma
# Clearing npm's cache keeps it out of the image.
RUN npm ci --omit=dev && npm cache clean --force

# The app's files stay owned by root and are only read at runtime. A
# `chown -R` on /app would copy all of node_modules into a new layer and
# double the image size (enough to fill a Raspberry Pi's SD card), so only
# what the app writes to belongs to "node": .next (its runtime cache) and data.
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --chmod=755 entrypoint.sh ./entrypoint.sh

# Data directory for the SQLite file, logos and photos (bind-mounted in
# compose). Run as the "node" user the base image already ships (uid/gid
# 1000). That's also the default first non-root user on Debian/Raspberry Pi
# OS/Ubuntu, so the bind-mounted ./data volume (owned by that user on the
# host) is writable without extra configuration. If your host user has a
# different uid/gid, either `chown -R 1000:1000 ./data` on the host, or
# override with `user: "<uid>:<gid>"` in docker-compose.yml.
RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
CMD ["npm", "start"]
