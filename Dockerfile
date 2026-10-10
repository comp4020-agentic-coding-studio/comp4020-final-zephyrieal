# syntax = docker/dockerfile:1

# Node + Express + SQLite (node:sqlite, built into Node itself --- no native
# addon to compile) serving a static React+Phaser client that Vite builds.
# The server still runs straight from TypeScript source via Node's own type
# stripping (see PROCESS.md); only the client needs a build step now. That
# build happens in its own stage so the runtime image never carries
# react/vite/phaser or any client source --- it only ever installs
# express/marked/ws. The app serves HTTP on 0.0.0.0:$PORT (fly.toml sets
# PORT) and publishes README.md, rendered, at /readme/.

FROM node:24.21.0-alpine AS build-deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM build-deps AS build
COPY . .
RUN pnpm build

FROM node:24.21.0-alpine AS prod-deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:24.21.0-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/server ./src/server
COPY --from=build /app/public ./public
COPY README.md ./README.md

EXPOSE 8080
CMD ["node", "src/server/index.ts"]
