#!/bin/bash

# 稳健的启动脚本配置
# 不使用 set -e，避免意外退出
# 不使用 set -m，避免与某些终端兼容性问题

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PROJECT_NAME="YIXZ-MCP"
MIN_NODE_VERSION="18"
SERVICE_URL="http://localhost:3001"

# 辅助函数
print_header() {
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}   ${PROJECT_NAME} - Mac/Linux 一键启动${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
}

print_info() {
    echo -e "${CYAN}[信息]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[警告]${NC} $1"
}

print_error() {
    echo -e "${RED}[错误]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[成功]${NC} $1"
}

check_node() {
    if ! command -v node &> /dev/null; then
        print_error "未检测到 Node.js"
        echo ""
        echo "请先安装 Node.js（推荐 v18 或更高版本）"
        echo "macOS 安装方式："
        echo "  1. 访问 https://nodejs.org/ 下载安装包"
        echo "  2. 或使用 Homebrew: brew install node"
        echo ""
        echo "Linux 安装方式："
        echo "  使用系统包管理器安装，如："
        echo "  - Ubuntu/Debian: sudo apt install nodejs npm"
        echo "  - CentOS/RHEL: sudo yum install nodejs npm"
        echo "  - Arch: sudo pacman -S nodejs npm"
        echo ""
        exit 1
    fi

    NODE_VERSION=$(node -v)
    print_info "检测到 Node.js ${NODE_VERSION}"
    echo ""
}

detect_package_manager() {
    if command -v pnpm &> /dev/null && [ -f "pnpm-lock.yaml" ]; then
        PM="pnpm"
        print_info "检测到 pnpm-lock.yaml，使用 pnpm"
    elif command -v yarn &> /dev/null && [ -f "yarn.lock" ]; then
        PM="yarn"
        print_info "检测到 yarn.lock，使用 yarn"
    else
        PM="npm"
        print_info "使用 npm"
    fi
    echo ""
}

install_dependencies() {
    if [ ! -d "node_modules" ]; then
        print_info "正在安装依赖（首次运行可能需要几分钟）..."
        echo ""

        # 执行安装并检查结果（兼容 set -m）
        if ! $PM install; then
            echo ""
            print_error "依赖安装失败"
            echo ""
            echo "可能的原因："
            echo "1. 网络连接问题，请检查网络或配置代理"
            echo "2. Node.js 版本过低，请升级到 v18+"
            echo "3. 权限问题，请尝试使用 sudo（仅限必要时）"
            echo ""
            read -p "按回车键退出..."
            exit 1
        fi

        echo ""
        print_success "依赖安装完成"
        echo ""
    else
        print_info "已检测到 node_modules，跳过依赖安装"
        print_info "如需重新安装，请删除 node_modules 文件夹后重新运行"
        echo ""
    fi
}

build_frontend() {
    if [ ! -d "dist" ]; then
        print_info "正在构建前端资源..."
        echo ""

        # 执行构建并检查结果（兼容 set -m）
        if ! $PM run build; then
            echo ""
            print_error "前端构建失败"
            echo ""
            echo "可能的原因："
            echo "1. TypeScript 编译错误，请检查代码"
            echo "2. 依赖未完全安装，请删除 node_modules 后重新运行"
            echo ""
            read -p "按回车键退出..."
            exit 1
        fi

        echo ""
        print_success "前端构建完成"
        echo ""
    else
        print_info "已检测到 dist 文件夹，跳过构建"
        print_info "如需重新构建，请删除 dist 文件夹后重新运行"
        echo ""
    fi
}

start_service() {
    echo ""
    print_info "准备启动服务"
    echo ""
    echo -e "${CYAN}[访问地址]${NC} ${SERVICE_URL}"
    echo -e "${CYAN}[停止服务]${NC} 按 Ctrl + C"
    echo ""

    # 启动服务器（后台运行，使用 nohup 确保服务独立运行）
    print_info "正在后台启动服务..."

    # 保存服务PID到文件，方便后续停止
    PID_FILE=".service_pid"

    # 使用 nohup 让服务完全独立运行，即使脚本退出也不影响
    nohup $PM start > /dev/null 2>&1 &
    SERVER_PID=$!
    echo $SERVER_PID > "$PID_FILE"

    # 等待服务就绪（最多30秒）
    print_info "等待服务启动..."
    MAX_WAIT=30
    WAIT_COUNT=0

    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
        # 检查端口 3001 是否在监听
        if command -v lsof &> /dev/null; then
            if lsof -i :3001 &> /dev/null; then
                print_success "服务已就绪！"
                break
            fi
        elif command -v netstat &> /dev/null; then
            if netstat -an 2>/dev/null | grep -q ":3001.*LISTEN"; then
                print_success "服务已就绪！"
                break
            fi
        elif command -v ss &> /dev/null; then
            if ss -ln 2>/dev/null | grep -q ":3001"; then
                print_success "服务已就绪！"
                break
            fi
        fi

        sleep 1
        WAIT_COUNT=$((WAIT_COUNT + 1))
        echo -n "."
    done

    echo ""

    # 如果超时仍未就绪，给出警告但继续
    if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
        print_warn "服务可能尚未完全就绪，但继续执行..."
    fi

    # 打开浏览器
    print_info "正在打开浏览器..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        open "$SERVICE_URL" 2>/dev/null || true
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v xdg-open &> /dev/null; then
            xdg-open "$SERVICE_URL" 2>/dev/null || true
        elif command -v gnome-open &> /dev/null; then
            gnome-open "$SERVICE_URL" 2>/dev/null || true
        fi
    fi

    sleep 1
    echo ""
    print_success "服务正在运行"
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${GREEN}  服务已启动！${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo -e "${CYAN}访问地址:${NC} ${SERVICE_URL}"
    echo -e "${CYAN}服务 PID:${NC} ${SERVER_PID}"
    echo -e "${CYAN}PID 文件:${NC} ${PID_FILE}"
    echo ""
    echo -e "${YELLOW}提示：${NC}"
    echo -e "  1. 按 Ctrl + C 退出此脚本（服务将继续在后台运行）"
    echo -e "  2. 或直接关闭终端窗口"
    echo ""
    echo -e "${YELLOW}停止后台服务的方法：${NC}"
    echo -e "  ${CYAN}kill \$(cat .service_pid)${NC}  # 使用保存的 PID"
    echo -e "  ${CYAN}pkill -f '${PM} start'${NC}     # 强制停止匹配的进程"
    echo -e "  ${CYAN}lsof -ti:3001 | xargs kill${NC} # 通过端口停止"
    echo ""
}

# 主流程
main() {
    print_header
    check_node
    detect_package_manager
    install_dependencies
    build_frontend
    start_service
}

# 捕获中断信号 - 优雅退出
trap 'echo ""; print_info "已收到中断信号"; print_info "服务继续在后台运行（PID: $SERVER_PID）"; echo ""; exit 0' INT TERM

# 执行主流程
main

# 启动完成后，等待用户输入（类似 Windows 版本的 pause）
echo ""
echo -e "${CYAN}按回车键退出...${NC}"

# 使用更稳健的等待方式，兼容各种终端
# 检查是否有交互式终端
if [ -t 0 ]; then
    # 交互式终端，等待输入
    read
else
    # 非交互式（如双击 .command 文件），等待一段时间
    sleep 5
fi
