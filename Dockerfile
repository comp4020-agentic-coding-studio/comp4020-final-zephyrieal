# syntax = docker/dockerfile:1

# Node + Express + SQLite (node:sqlite, built into Node itself --- no native
# addon to compile), run straight from TypeScript source via Node's own type
# stripping. See PROCESS.md for why. The app serves HTTP on 0.0.0.0:$PORT
# (fly.toml sets PORT) and publishes README.md, rendered, at /readme/.

FROM node:24.21.0-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:24.21.0-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
COPY README.md ./README.md

EXPOSE 8080
CMD ["node", "src/server/index.ts"]
