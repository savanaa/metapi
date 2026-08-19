# ========== 构建阶段 ==========
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# 替换 APT 源为阿里云（适配 bookworm 的 debian.sources）
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources \
    && sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHON=/usr/bin/python3

# 设置 NPM 镜像为淘宝源
RUN npm config set registry https://registry.npmmirror.com

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

# 重建 native 模块（从镜像源获取二进制）
RUN npm rebuild esbuild sharp better-sqlite3 --no-audit --no-fund

COPY . .
RUN npm run build:web && npm run build:server
RUN npm prune --omit=dev --no-audit --no-fund

# ========== 运行阶段 ==========
FROM node:22-bookworm-slim

WORKDIR /app

# 同样替换 APT 源
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources \
    && sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# 从构建阶段复制产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/drizzle ./drizzle

RUN mkdir -p /app/data

EXPOSE 4000

ENV NODE_ENV=production
ENV DATA_DIR=/app/data

CMD ["sh", "-c", "node dist/server/db/migrate.js && node dist/server/index.js"]
