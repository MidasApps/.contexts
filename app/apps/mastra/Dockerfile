# syntax=docker/dockerfile:1
# Mastra server for Cloud Run. Build from the workspace root (app/):
#   docker build -f apps/mastra/Dockerfile -t core-mastra .
# `mastra build` writes a self-contained server to .mastra/output (spec §16.3).

FROM node:26-alpine AS build
# Corepack is not bundled with Node 25+, so pnpm comes from npm (spec §16.3).
RUN npm install -g pnpm@12.6.0
WORKDIR /workspace
ENV MASTRA_TELEMETRY_DISABLED=1
COPY . .
# Only the Mastra app and the workspace packages it depends on.
RUN pnpm install --frozen-lockfile --filter "@core/mastra..."
# No --studio: Studio runs only in local via `mastra dev` (spec §16.3).
RUN pnpm --filter @core/mastra build

FROM node:26-alpine AS runtime
ENV NODE_ENV=production \
    MASTRA_HOST=0.0.0.0 \
    PORT=8081 \
    MASTRA_TELEMETRY_DISABLED=1
WORKDIR /srv/mastra
COPY --from=build --chown=node:node /workspace/apps/mastra/.mastra/output ./
USER node
EXPOSE 8081
CMD ["node", "index.mjs"]
