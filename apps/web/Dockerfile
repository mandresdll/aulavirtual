# SPA estática servida por nginx sin privilegios. Contexto de build: raíz del monorepo.
#   docker build -f apps/web/Dockerfile -t plataforma-web .

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @plataforma/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @plataforma/shared build && pnpm --filter @plataforma/web build

FROM nginxinc/nginx-unprivileged:1.30-alpine AS runtime
COPY infra/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/web/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
