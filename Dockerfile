# ---------------------------------------------------------------------------
# Carnet — image de production (Next.js standalone + migrations Prisma)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build:next

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Schéma + client généré (ceinture en plus du tracing standalone)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client
# CLI Prisma complet et isolé (db push au démarrage) — npm résout tout son arbre
RUN npm install --prefix /prisma-cli --no-save --no-audit --no-fund prisma@6.19.3 \
    && chown -R nextjs:nodejs /prisma-cli
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

RUN apk add --no-cache fontconfig \
    && mkdir -p /usr/share/fonts/carnet /data/receipts \
    && chown -R nextjs:nodejs /data
COPY --from=builder --chown=nextjs:nodejs /app/branding ./branding
RUN cp branding/fonts/*.ttf /usr/share/fonts/carnet/ && fc-cache -f
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/login >/dev/null 2>&1 || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
