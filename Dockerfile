# ==========================================
# 第一阶段：构建阶段
# ==========================================
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装 pnpm（如果项目使用 pnpm）
RUN npm install -g pnpm

# 复制 package.json 和锁文件
COPY package.json pnpm-lock.yaml* package-lock.json* ./

# 安装依赖（优先使用 pnpm，如果锁定文件存在）
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    else \
      npm ci; \
    fi

# 复制源代码
COPY . .

# 构建前端资源
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm run build; \
    else \
      npm run build; \
    fi

# 清理开发依赖，只保留生产依赖
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm prune --prod; \
    else \
      npm prune --production; \
    fi


# ==========================================
# 第二阶段：运行阶段
# ==========================================
FROM node:18-alpine AS runner

# 设置环境变量
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 设置工作目录
WORKDIR /app

# 从构建阶段复制必要文件
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/api ./api

# 创建数据目录并设置权限
RUN mkdir -p /app/api/data && \
    chown -R nodejs:nodejs /app/api/data

# 切换到非 root 用户
USER nodejs

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动应用
CMD ["node", "api/index.js"]
