# Laqta API (Hono on Bun). Build context = repo root.
FROM oven/bun:1.3.14-slim
WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN bun install --frozen-lockfile --production

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "apps/api/src/index.ts"]
