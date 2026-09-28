# ============================================================
# Stage 1: Install dependencies
# ============================================================
FROM node:22-alpine AS deps

RUN apk add --no-cache libc6-compat
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

# Copy lockfile, package manifest, and scripts needed by postinstall
COPY package.json pnpm-lock.yaml .pnpmfile.cjs ./
COPY scripts/ ./scripts/

# Install production + dev dependencies (dev needed for build step)
RUN pnpm install --frozen-lockfile

# ============================================================
# Stage 2: Build the application
# ============================================================
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build-time env vars that are public (NEXT_PUBLIC_*) must be available here.
# They get inlined into the client bundle at build time.
# Pass them via --build-arg or cloudbuild.yaml substitutions.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
# Sem este ARG o bundle do navegador cai no default de runtime-config
# (`dataviz`) — o servidor iria para o banco do env_file e o cliente para outro.
ARG NEXT_PUBLIC_DATAVIZ_DATABASE_ID
ARG NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN
ARG NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS

ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_DATAVIZ_DATABASE_ID=$NEXT_PUBLIC_DATAVIZ_DATABASE_ID
ENV NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN=$NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN
ENV NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS=$NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# ============================================================
# Stage 3: Production runner
# ============================================================
FROM node:22-alpine AS runner

WORKDIR /app

# Chromium para o export de PDF. `puppeteer-core` NÃO traz browser: sem isto,
# findChrome() em app/api/export-pdf/route.ts não acha executável e a rota
# falha em runtime — o build passa, então o problema só aparece em produção.
# CHROME_PATH é a primeira opção que findChrome() consulta.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV CHROME_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Disable telemetry at runtime
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Cloud Run uses PORT env var (default 8080)
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Copy standalone output from builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy public directory if it exists (optional)
# COPY --from=builder /app/public ./public

# Set ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 8080

# Identifica QUAL código está nesta imagem. Sem isto não há como responder
# "qual versão está no ar?" antes de decidir um rollback — achado R16.
# Build: docker build --build-arg GIT_SHA=$(git rev-parse HEAD) ...
ARG GIT_SHA=desconhecido
ENV GIT_SHA=$GIT_SHA
LABEL org.opencontainers.image.revision=$GIT_SHA

# Healthcheck for Cloud Run.
# Aponta para /api/health, e não para `/`: a home responde 200 mesmo com o
# Firestore fora, então um container incapaz de servir era declarado saudável e
# seguia recebendo tráfego.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/api/health || exit 1

# Start the Next.js standalone server
CMD ["node", "server.js"]
