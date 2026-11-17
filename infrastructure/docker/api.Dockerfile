# API image for the PoC (runs via ts-node transpile-only).
FROM node:20-alpine

RUN corepack enable
WORKDIR /app

# Manifests first (dependency layer).
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN corepack pnpm install

# Source code.
COPY packages ./packages
COPY apps/api ./apps/api

# Build the shared packages (contracts/domain/shared) for runtime resolution.
RUN corepack pnpm --filter @bp/contracts --filter @bp/shared --filter @bp/domain build

WORKDIR /app/apps/api
ENV TS_NODE_TRANSPILE_ONLY=1
EXPOSE 3001

# Run migrations and start the API.
CMD ["sh", "-c", "corepack pnpm exec ts-node -r tsconfig-paths/register -P tsconfig.json src/infra/database/run-migrations.ts && corepack pnpm exec ts-node -r tsconfig-paths/register -P tsconfig.json src/main.ts"]
