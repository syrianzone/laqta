# Laqta web (SvelteKit SSR via adapter-node). Build context = repo root.
FROM oven/bun:1.3.14-slim AS build
WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN bun install --frozen-lockfile
# PUBLIC_* are inlined at build time; provided as build args.
ARG PUBLIC_API_URL=http://localhost:3000
ARG PUBLIC_WEB_URL=http://localhost:5173
ENV PUBLIC_API_URL=$PUBLIC_API_URL PUBLIC_WEB_URL=$PUBLIC_WEB_URL
RUN bun run --cwd apps/web build

FROM oven/bun:1.3.14-slim
WORKDIR /app
COPY --from=build /app/apps/web/build ./build
COPY --from=build /app/apps/web/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "./build/index.js"]
