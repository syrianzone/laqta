# Laqta background worker (BullMQ + sharp on Bun). Build context = repo root.
FROM oven/bun:1.3.14-slim
WORKDIR /app

# libvips runtime deps for sharp (incl. HEIC support via libheif)
RUN apt-get update \
    && apt-get install -y --no-install-recommends libheif1 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN bun install --frozen-lockfile --production

ENV NODE_ENV=production
CMD ["bun", "run", "apps/worker/src/index.ts"]
