# Rig Valley — one service: game at /, admin at /admin/, API at /api.
FROM node:22-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# Install workspace dependencies first (cached unless a manifest changes).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
COPY client/package.json client/
COPY admin/package.json admin/
RUN pnpm install --frozen-lockfile

# Build the game and the admin panel.
COPY . .
RUN pnpm --filter @rig-valley/client build && pnpm --filter @rig-valley/admin build

ENV NODE_ENV=production HOST=0.0.0.0 SERVE_STATIC=true
EXPOSE 8787
CMD ["pnpm", "--filter", "@rig-valley/server", "start"]
