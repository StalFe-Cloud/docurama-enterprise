FROM oven/bun:1.2 AS base
WORKDIR /app
# Prisma must detect the installed OpenSSL ABI during client generation and
# find the same libraries when the generated engine starts in the runner.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile
RUN bunx prisma generate

# Build application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
RUN bunx next build
RUN cp -R .next/static .next/standalone/.next/ && cp -R public .next/standalone/ && cp -R tessdata .next/standalone/
RUN bun build scripts/bootstrap-admin.ts --target=bun --packages=external --outfile=.next/standalone/bootstrap-admin.js

# Production runner — hardened, non-root, self-migrating
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Demo credentials must be opted INTO, never shipped on.
ENV NEXT_PUBLIC_DEMO_MODE=false

# Fonts for everything that rasterises text in production: the signer
# preview's per-recipient watermark, and pdfjs rendering of PDFs that rely on
# system fonts. Debian slim ships none, so a missing package here would
# silently degrade both to textless output.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/* \
  # Non-root runtime identity; volumes mount over /app/db and /app/storage.
  && groupadd -g 10001 docurama \
  && useradd -u 10001 -g docurama -m -s /usr/sbin/nologin docurama

COPY --from=builder --chown=10001:10001 /app/.next/standalone ./
COPY --from=builder --chown=10001:10001 /app/prisma ./prisma
COPY --from=builder --chown=10001:10001 /app/content ./content
# Prisma CLI for the entrypoint's idempotent schema push (migrations on boot).
COPY --from=deps --chown=10001:10001 /app/node_modules ./node_modules
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/db /app/storage \
  && chown docurama:docurama /app /app/db /app/storage

USER docurama

# Orchestrator-grade liveness: /api/health fails 503 when DB or storage break.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["bun", "server.js"]
