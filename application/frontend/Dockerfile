# ─────────────────────────────────────────────────────────────
# Stage 1: deps — 依存パッケージのみインストール
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# ─────────────────────────────────────────────────────────────
# Stage 2: builder — Next.js standalone ビルド
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ビルド時に必要な環境変数（実際の値はランタイムで注入）
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 3: runner — 最小イメージで standalone を実行
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# 非 root ユーザーで実行
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# standalone には server.js + node_modules が含まれる
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# 静的アセット
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# public ディレクトリ（存在する場合）
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
