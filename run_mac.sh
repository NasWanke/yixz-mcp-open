#!/bin/bash

set -e

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

        $PM install

        if [ $? -ne 0 ]; then
            echo ""
            print_error "依赖安装失败"
            echo ""
            echo "可能的原因："
            echo "1. 网络连接问题，请检查网络或配置代理"
            echo "2. Node.js 版本过低，请升级到 v18+"
            echo "3. 权限问题，请尝试使用 sudo（仅限必要时）"
            echo ""
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

        $PM run build

        if [ $? -ne 0 ]; then
            echo ""
            print_error "前端构建失败"
            echo ""
            echo "可能的原因："
            echo "1. TypeScript 编译错误，请检查代码"
            echo "2. 依赖未完全安装，请删除 node_modules 后重新运行"
            echo ""
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

    # 启动服务器（后台运行）
    print_info "正在后台启动服务..."
    $PM start &
    SERVER_PID=$!

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
    print_info "服务正在运行"
    echo ""
    echo -e "${YELLOW}提示：按 Ctrl + C 停止服务，或直接关闭窗口（服务将继续在后台运行）${NC}"
    echo ""

    # 等待后台服务
    wait $SERVER_PID 2>/dev/null

    echo ""
    print_info "服务已停止"
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

# 捕获中断信号
trap 'echo ""; print_info "已收到中断信号，正在退出..."; exit 0' INT

# 执行主流程
main
