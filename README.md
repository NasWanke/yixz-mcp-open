# 🚀 YIXZ-MCP 节点聚合管理平台

**YIXZ-MCP** 是一个轻量级的 **Model Context Protocol (MCP)** 节点聚合管理工具。它允许你管理多个 MCP 服务节点（支持 SSE 在线服务和本地 stdio 命令），并将它们聚合为一个统一的 SSE 接入地址。

通过这个工具，你只需在xiaozhi.me控制台获取接入地址，填入实例后即可同时使用所有集成的 MCP 工具。

## ✨ 核心功能

*   **🔗 节点聚合**：将分散的 MCP 服务（如本地运行的 Python 脚本、远程 SSE 服务）聚合成单一入口。
*   **⚡ 统一接入**：生成标准的 SSE 接入地址，完美兼容 Cursor、Trae 等支持 MCP 的客户端。
*   **🔌 多协议支持**：
    *   **SSE (Server-Sent Events)**: 接入现有的 MCP Web 服务。
    *   **Stdio (Standard Input/Output)**: 直接运行本地命令（如 `node script.js`, `python script.py`）。
*   **📱 响应式界面**：完美适配桌面端和移动端，随时随地管理节点。
*   **🚀 轻量级架构**：基于 Node.js + Express + Vue 3，数据存储采用 JSON 文件，无需数据库，部署极简。

## 🚀更新日志

### v0.0.3 (2025-01-30)
- 每次添加点节不用再手动重启了，会自动更新
- 自动更新的时候节点显示"连接中"状态（黄色背景显示）
- 节点状态自动轮询更新（每2秒），直到显示“已连接”就说明成功了

## 📝更新说明

⚡**更新前请先备份MCP配置文件**

```
# 在项目目录下,请手动备份
./api/data/instances.json
```



## 🛠️ 部署指南

我们提供了三种部署方式，请根据你的使用场景选择最适合的一种：

| 部署方式 | 适用场景 | 难度 | 维护成本 |
|---------|---------|------|---------|
| 🚀 **一键启动脚本** | 个人电脑、快速测试 | ⭐ 简单 | 低 |
| 🐳 **Docker 容器化** | 服务器、生产环境 | ⭐⭐ 中等 | 低 |
| 🌐 **服务器面板** | VPS 长期运行、已有面板 | ⭐⭐ 中等 | 中 |

---

### 方式一：一键启动脚本 (无 Docker) 🚀

**适合人群**：个人用户、开发者、想快速体验的用户

**系统要求**：
- **操作系统**：Windows 10+ / macOS / Linux
- **Node.js**：v18 或更高版本 ([下载地址](https://nodejs.org/))

#### 🪟 Windows 用户

1. **下载项目**
   ```bash
   git clone https://github.com/NasWanke/yixz-mcp-open.git
   cd yixz-mcp-open
   ```

2. **一键启动**
   - 双击运行 `run_windows.bat`
   - 脚本会自动完成以下操作：
     - ✅ 检测 Node.js 环境
     - ✅ 安装项目依赖
     - ✅ 构建前端资源
     - ✅ 启动服务
     - ✅ 自动打开浏览器

3. **访问应用**
   - 浏览器会自动打开 `http://localhost:3001`
   - 如需停止服务，在命令行窗口按 `Ctrl + C`

#### 🍎 Mac / Linux 用户

1. **下载项目**
   ```bash
   git clone https://github.com/NasWanke/yixz-mcp-open.git
   cd yixz-mcp-open
   ```

2. **赋予执行权限**
   ```bash
   chmod +x run_mac.sh
   ```

3. **一键启动**
   ```bash
   ./run_mac.sh
   ```

4. **访问应用**
   - 浏览器会自动打开 `http://localhost:3001`
   - 如需停止服务，在终端按 `Ctrl + C`

#### ⚙️ 脚本功能说明

两个脚本（`run_windows.bat` 和 `run_mac.sh`）均提供以下智能功能：

- 🔍 **环境检测**：自动检测 Node.js 是否安装
- 📦 **智能依赖管理**：
  - 首次运行自动安装依赖
  - 已安装依赖时跳过安装步骤
  - 自动检测并使用 pnpm（如果存在）
- 🏗️ **构建优化**：
  - 首次运行自动构建前端
  - 已构建时跳过构建步骤
- 🚀 **自动启动**：服务启动后自动打开浏览器
- 🛡️ **错误处理**：详细的错误提示和解决方案

#### 📝 常见问题

<details>
<summary><b>Q: 提示 "Node.js 未安装" 怎么办？</b></summary>

访问 [Node.js 官网](https://nodejs.org/) 下载 LTS 版本安装。安装完成后重新运行脚本。
</details>

<details>
<summary><b>Q: 依赖安装失败怎么办？</b></summary>

可能原因：
1. 网络问题：尝试配置 npm 镜像源 `npm config set registry https://registry.npmmirror.com`
2. 权限问题（Linux/Mac）：尝试使用 `sudo npm install`
3. Node.js 版本过低：升级到 v18+
</details>

<details>
<summary><b>Q: 如何强制重新构建前端？</b></summary>

删除 `dist` 文件夹后重新运行脚本即可：
- Windows: 删除 `dist` 文件夹
- Mac/Linux: `rm -rf dist`
</details>

---

### 方式二：Docker 容器化部署 🐳

**适合人群**：
- 熟悉 Docker 的开发者
- 需要在服务器上部署的用户
- 希望环境隔离、易于迁移的场景

**系统要求**：
- **Docker**：20.10+
- **Docker Compose**：2.0+

#### 📦 快速开始

1. **安装 Docker**
   - **Windows/Mac**：下载 [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   - **Linux**：
     ```bash
     curl -fsSL https://get.docker.com | sh
     sudo usermod -aG docker $USER
     ```

2. **启动服务**
   ```bash
   # 克隆项目
   git clone https://github.com/NasWanke/yixz-mcp-open.git
   cd yixz-mcp-open
   
   # 构建并启动（后台运行）
   docker-compose up -d --build
   ```

3. **查看日志**
   ```bash
   # 查看实时日志
   docker-compose logs -f
   
   # 查看服务状态
   docker-compose ps
   ```

4. **访问应用**
   - 打开浏览器访问 `http://localhost:3001`

#### 🛠️ Docker 管理命令

```bash
# 停止服务
docker-compose stop

# 启动服务
docker-compose start

# 重启服务
docker-compose restart

# 停止并删除容器
docker-compose down

# 查看资源占用
docker stats yixz-mcp-open
```

#### 💾 数据持久化

- 配置数据自动保存在 `./api/data` 目录
- 容器删除或重建不会丢失数据
- 备份数据只需复制 `api/data` 文件夹

#### 🔧 高级配置

<details>
<summary><b>自定义端口</b></summary>

修改 `docker-compose.yml` 中的端口映射：
```yaml
ports:
  - "8080:3001"  # 将 8080 映射到容器内的 3001
```
</details>

<details>
<summary><b>使用 Nginx 反向代理</b></summary>

取消 `docker-compose.yml` 中 Nginx 服务的注释，配置 `nginx.conf`：
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://yixz-mcp:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
</details>

<details>
<summary><b>健康检查</b></summary>

Docker 会自动检查服务健康状态：
- 检查间隔：30 秒
- 超时时间：10 秒
- 重试次数：3 次

查看健康状态：
```bash
docker inspect --format='{{.State.Health.Status}}' yixz-mcp-open
```
</details>

---

### 方式三：服务器面板部署 (宝塔 / 1Panel) 🌐

**适合人群**：
- 使用 VPS/云服务器的用户
- 已安装宝塔或 1Panel 面板的用户
- 需要通过 Web 界面管理的场景

**系统要求**：
- **操作系统**：CentOS / Ubuntu / Debian
- **Node.js**：v18+
- **面板**：宝塔面板 7.x+ 或 1Panel

#### 📋 部署步骤

1. **上传项目文件**
   - 使用 Git 克隆或 FTP/SFTP 上传到服务器
   - 推荐目录：`/www/wwwroot/mcp-open` 或 `/opt/mcp-open`

   ```bash
   # 使用 Git 克隆
   cd /www/wwwroot
   git clone https://github.com/your-repo/yixz-mcp-open.git
   cd yixz-mcp-open
   ```

2. **安装依赖与构建**

   ```bash
   # 安装依赖
   npm install

   # 构建前端资源
   npm run build

   # 验证构建结果
   ls -la dist/
   ```

3. **启动服务**

   **方式 A：宝塔面板**
   - 登录宝塔面板
   - 点击左侧 `网站` -> `Node项目`
   - 点击 `添加Node项目`
   - 填写配置：
     - **项目名称**：`yixz-mcp-open`
     - **项目目录**：`/www/wwwroot/yixz-mcp-open`
     - **启动文件**：`api/index.ts` 或使用 `package.json` 的 `start` 脚本
     - **端口**：`3001`
     - **运行用户**：`www`
   - 点击 `提交` 并启动项目

   **方式 B：1Panel**
   - 登录 1Panel 面板
   - 点击 `容器` -> `应用商店`
   - 搜索并安装 `Node.js` 运行环境
   - 配置：
     - **项目目录**：`/opt/yixz-mcp-open`
     - **启动命令**：`npm start`
     - **端口**：`3001`

   **方式 C：命令行 PM2**
   ```bash
   # 安装 PM2
   npm install -g pm2

   # 启动服务
   pm2 start npm --name "yixz-mcp-open" -- start

   # 设置开机自启
   pm2 startup
   pm2 save

   # 查看状态
   pm2 status
   pm2 logs yixz-mcp-open
   ```

4. **配置反向代理 (可选)**

   如果你想通过域名访问，配置 Nginx 反向代理：

   **宝塔面板：**
   - 点击 `网站` -> `添加站点`
   - 填写域名，创建站点
   - 点击 `设置` -> `反向代理`
   - 添加规则：
     - **代理名称**：`MCP Open`
     - **目标 URL**：`http://127.0.0.1:3001`
     - **发送域名**：`$host`

   **手动配置 Nginx：**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://127.0.0.1:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

5. **配置 SSL (可选)**

   使用宝塔面板或 Let's Encrypt 免费证书：
   ```bash
   # 使用 Certbot
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

#### 🔧 服务器维护

```bash
# 查看日志
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# 重启服务
pm2 restart yixz-mcp-open

# 重启 Nginx
sudo systemctl restart nginx

# 查看端口占用
netstat -tulnp | grep 3001
```

#### 📊 性能优化建议

1. **使用 PM2 集群模式**（多核 CPU）
   ```bash
   pm2 start npm --name "mcp-open" -i max -- start
   ```

2. **配置 Nginx 缓存**（静态资源）
   ```nginx
   location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
       expires 1y;
       add_header Cache-Control "public, immutable";
   }
   ```

3. **启用 gzip 压缩**
   ```nginx
   gzip on;
   gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
   ```

---

## 📖 使用指南

1.  **创建实例**：
    *   打开首页，点击右上角“新建实例”，填写名称（如 "My Tools"）。
2.  **添加节点**：
    *   进入实例详情页，点击“添加节点”。
    *   **SSE 模式**：填写远程 MCP 服务的 URL。
    *   **Stdio 模式**：填写要执行的命令（如 `npx`）和参数（如 `-y @modelcontextprotocol/server-filesystem c:\projects`）。
3.  **获取接入地址**：
    *   在实例详情页顶部，复制“接入地址”（通常以 `/api/mcp/{id}/sse` 结尾）。
4.  **配置 AI 客户端**：
    *   打开 **Cursor** 或 **Trae** 的设置页面。
    *   找到 **MCP** 设置 -> **Add new MCP server**。
    *   **Type** 选择 `SSE`。
    *   **URL** 填入刚才复制的地址。
    *   点击保存，即可连接成功！

---

## 💻 开发指南

如果你想参与开发或修改源码：

```bash
# 1. 安装依赖
pnpm install

# 2. 启动开发服务器 (前后端同时启动)
pnpm run dev
```

*   **前端地址**: `http://localhost:5173`
*   **后端地址**: `http://localhost:3001`

---

## 📄 License

Apache-2.0 license
