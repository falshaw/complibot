# =============================================================================
# CompliBot - AI Security Questionnaire Responder
# =============================================================================
FROM node:24.19-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS base
RUN apk upgrade --no-cache

# Dependencies stage (postinstall runs `prisma generate`, so the schema and
# config must be present before npm ci)
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# One-shot init: apply migrations, then seed demo data (idempotent).
# Used by the complibot-init service in docker-compose.yml.
FROM deps AS init
COPY tsconfig.json ./
COPY src/lib/demo-knowledge.ts ./src/lib/demo-knowledge.ts
ENV NODE_ENV=production NPM_CONFIG_UPDATE_NOTIFIER=false
USER node
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts"]

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG DOCKER_BUILD=1
ENV DOCKER_BUILD=${DOCKER_BUILD}
ENV AUTH_SECRET="build-placeholder-replaced-at-runtime"
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate
RUN npm run build

# Runner stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# Defense-in-depth: remove any .env leaked into standalone output
RUN rm -f .env .env.*
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
