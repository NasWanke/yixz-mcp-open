# ==========================================
# YIXZ MCP 开放平台 - Docker 镜像
# ==========================================

FROM node:latest

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0

# 复制 package.json 和锁文件
COPY package.json pnpm-lock.yaml package-lock.json ./

# 安装 pnpm
RUN npm install -g pnpm

# 安装所有依赖（包括 devDependencies，因为需要 tsx）
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    else \
      npm install; \
    fi

# 复制源代码
COPY . .

# 构建前端
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm run build; \
    else \
      npm run build; \
    fi

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 使用 pnpm 运行 tsx 启动服务
CMD ["pnpm", "start"]
