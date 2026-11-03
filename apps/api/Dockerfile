# Imagen de la API y del worker. Contexto de build: raíz del monorepo.
#   docker build -f apps/api/Dockerfile -t plataforma-api .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @plataforma/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
# `build` de la API incluye `prisma generate`; `deploy` copia solo dependencias de producción,
# por eso el cliente se vuelve a generar dentro de /out.
RUN pnpm --filter @plataforma/shared build \
 && pnpm --filter @plataforma/api build \
 && pnpm --filter @plataforma/api deploy --prod --legacy /out \
 && cd /out && ./node_modules/.bin/prisma generate --no-hints

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]
