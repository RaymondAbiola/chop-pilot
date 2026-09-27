# One image, two services. Build with --build-arg APP=agent or APP=chopeazy-mock.
FROM node:24-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

WORKDIR /repo

FROM base AS build
ARG APP
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/${APP}/package.json apps/${APP}/
RUN pnpm install --frozen-lockfile --filter "@choppilot/${APP}..."

COPY packages/shared packages/shared
COPY apps/${APP} apps/${APP}
RUN pnpm --filter @choppilot/shared build \
  && pnpm --filter "@choppilot/${APP}" build \
  && pnpm prune --prod

FROM base AS run
ARG APP
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/${APP}
CMD ["node", "dist/index.js"]
