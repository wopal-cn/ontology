#!/bin/bash
set -e

# Wopal Agent Sandbox Runner (Wopal 专属智能体沙箱执行器)
# 核心作用: 将宿主体内指定的一个子项目绝对隔离地挂载进安全容器，阻止 Agent 访问全局空间。

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
IMAGE_NAME="wopal-agent-sandbox-cn:latest"
USE_CN_MIRROR=true
STORAGE_BASE="$HOME/.wopal/storage/sandbox"

# 提取参数，支持 --no-cn 关闭中国代理模式
CLEANED_ARGS=()
for arg in "$@"; do
    if [ "$arg" == "--no-cn" ]; then
        IMAGE_NAME="wopal-agent-sandbox:latest"
        USE_CN_MIRROR=false
    else
        CLEANED_ARGS+=("$arg")
    fi
done
set -- "${CLEANED_ARGS[@]}"

show_help() {
    cat << EOF
Wopal Agent Sandbox CLI

用法: $0 [命令] [参数]

命令选项:
    run <子项目路径> [命令]       将指定项目挂载至沙箱执行命令（默认 opencode）
    tui <子项目路径>              推荐：自动启动/连接 serve 并进入 TUI
    serve <子项目路径>            启动后台 OpenCode serve 服务
    serve stop <项目名>           停止指定项目的 serve
    serve list                    列出运行中的 serve 实例
    serve logs <项目名>           查看 serve 服务的日志输出
    serve enter <项目名>          进入 serve 容器的 bash
    serve prune <项目名>          清理指定项目的持久化存储
    build [--no-cn]               构建沙箱 Docker 镜像
    auth [--no-cn]                进入沙箱进行 OpenCode 登录验证
    help                          显示这条帮助信息

注: 以上所有命令都默认使用加速源。你可以随时在命令任意位置添加 --no-cn 显式停用加速。

目录验证:
    仅允许 Git 仓库或 Worktree 进入沙箱。普通目录会提示警告并要求确认。

存储结构:
    ~/.wopal/storage/sandbox/<项目名>/
    ├── share/    # opencode 数据（DB、认证、工具）
    └── cache/    # opencode 缓存

调用示例:
    $0 tui projects/agent-tools           # 推荐：进入 TUI
    $0 run projects/agent-tools           # 默认执行 opencode
    $0 run projects/agent-tools bash      # 进入容器 bash
    $0 serve projects/agent-tools         # 启动后台 serve
    $0 serve list                         # 查看所有 serve
    $0 serve stop agent-tools             # 停止 serve
    $0 serve logs agent-tools             # 查看 serve 日志
    $0 serve enter agent-tools            # 进入 serve 容器
    $0 serve prune agent-tools            # 清理存储
EOF
}

# 向上追溯查找工作空间根目录
find_workspace_root() {
    local dir="$(cd "$1" && pwd 2>/dev/null || echo "$PWD")"
    while [ "$dir" != "/" ] && [ ! -f "$dir/.workspace.md" ]; do
        dir="$(dirname "$dir")"
    done
    
    if [ "$dir" == "/" ]; then
        echo "Error: Could not find .workspace.md to determine workspace root." >&2
        return 1
    fi
    echo "$dir"
}

# 核心安全拦截器：防止越界挂载
validate_target_dir() {
    local target="$1"
    local abs_target
    
    if [ -d "$target" ]; then
        abs_target="$(cd "$target" && pwd)"
    else
        local ws_root
        if ws_root="$(find_workspace_root "$PWD")" && [ -d "$ws_root/$target" ]; then
            abs_target="$(cd "$ws_root/$target" && pwd)"
        else
            echo "Error: Directory '$target' does not exist." >&2
            exit 1
        fi
    fi
    
    local final_ws_root
    if ! final_ws_root="$(find_workspace_root "$abs_target")"; then
        exit 1
    fi
    
    if [ "$abs_target" == "$final_ws_root" ]; then
        echo "Error: Mounting the workspace root is strictly prohibited!" >&2
        exit 1
    fi

    if [[ ! "$abs_target" == "$final_ws_root"/* ]]; then
        echo "Error: Target directory '$abs_target' is outside the workspace root." >&2
        exit 1
    fi
    
    echo "$abs_target"
}

# 验证目录是否为 Git 仓库或 Worktree
validate_project_dir() {
    local target="$1"
    
    if [ -d "$target/.git" ] || [ -f "$target/.git" ]; then
        return 0
    fi
    
    echo ""
    echo "⚠️  Warning: '$target' is not a Git repository or worktree."
    echo "   Sandboxes are designed for isolated project development."
    echo ""
    read -p "Continue anyway? [y/N] " choice
    [[ "$choice" =~ ^[yY]$ ]]
}

# 初始化项目级存储，返回 share_dir 路径
init_project_storage() {
    local project_name="$1"
    local share_dir="$STORAGE_BASE/$project_name/share"
    local cache_dir="$STORAGE_BASE/$project_name/cache"
    
    mkdir -p "$share_dir" "$cache_dir"
    
    local src_share="$HOME/.local/share/opencode"
    local f
    for f in auth.json mcp-auth.json; do
        [ ! -f "$share_dir/$f" ] && [ -f "$src_share/$f" ] && cp "$src_share/$f" "$share_dir/$f"
    done
    
    [ ! -d "$share_dir/bin" ] && [ -d "$src_share/bin" ] && cp -r "$src_share/bin" "$share_dir/"
    
    SHARE_DIR="$share_dir"
    CACHE_DIR="$cache_dir"
}

# 确保 Docker 镜像存在
ensure_image() {
    if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
        echo "Image not found. Building first..."
        build_image
    fi
}

# 执行镜像构建
build_image() {
    local dockerfile="$SCRIPT_DIR/Dockerfile"
    [ "$USE_CN_MIRROR" = true ] && dockerfile="$SCRIPT_DIR/Dockerfile.cn"
    
    echo "Building ${IMAGE_NAME}..."
    docker build -f "$dockerfile" --build-arg OPENCODE_BUILD_TIME=$(date +%Y%m%d) -t "$IMAGE_NAME" "$SCRIPT_DIR"
    docker image prune
}

# 查找可用端口 (20000-30000)
find_available_port() {
    local port
    if command -v ss >/dev/null 2>&1; then
        port=$(comm -23 <(seq 20000 30000) <(ss -tlnH 'sport >= 20000 and sport <= 30000' | awk '{print $4}' | cut -d: -f2 | sort -n) | head -1)
    else
        for port in $(seq 20000 30000); do
            ! lsof -i :$port >/dev/null 2>&1 && echo $port && return 0
        done
    fi
    [ -n "$port" ] && echo "$port" && return 0
    echo "Error: No available port in range 20000-30000" >&2
    return 1
}

# 获取项目的 serve 容器列表
get_serve_containers() {
    local project_name="$1"
    docker ps ${2:+-a} --filter "name=sandbox-serve-${project_name}-" --format "{{.Names}}" 2>/dev/null
}

# 从容器名提取端口号
extract_port() {
    echo "$1" | grep -oE '[0-9]+$'
}

# Docker 挂载参数数组（在调用点填充）
declare -a DOCKER_MOUNTS

# 设置 Docker 挂载参数
setup_docker_mounts() {
    local ws_root="$1"
    local share_dir="$2"
    local cache_dir="$3"
    
    DOCKER_MOUNTS=(
        -v "$ws_root/.wopal/commands:/shared/opencode/commands:ro"
        -v "$ws_root/.wopal/plugins/opencode:/shared/opencode/plugins:ro"
        -v "$ws_root/.wopal/rules:/shared/opencode/rules:ro"
        -v "$ws_root/.agents/skills:/shared/opencode/skills:ro"
        -v "$ws_root/.wopal/subagents/opencode:/shared/opencode/agents:ro"
        -v "$HOME/.config/opencode:/home/coder/.config/opencode:ro"
        -v "$share_dir:/home/coder/.local/share/opencode:rw"
        -v "$cache_dir:/home/coder/.cache/opencode:rw"
        -v "$HOME/.gitconfig:/home/coder/.gitconfig:ro"
        -v "/var/run/docker.sock:/var/run/docker.sock:rw"
    )
}

# 等待 serve 就绪
wait_for_serve() {
    local port="$1"
    local url="http://127.0.0.1:$port"
    
    echo "Waiting for serve to start..."
    for i in {1..30}; do
        curl -s "$url" >/dev/null 2>&1 && return 0
        sleep 1
    done
    return 1
}

# 启动 serve 容器（核心逻辑，供 run_serve 和 run_tui 调用）
start_serve_container() {
    local abs_target="$1"
    local project_name="$2"
    local share_dir="$3"
    local cache_dir="$4"
    local port="$5"
    
    local container_name="sandbox-serve-${project_name}-${port}"
    local final_ws_root
    final_ws_root="$(find_workspace_root "$abs_target")"
    
    mkdir -p "$HOME/.config/opencode"
    
    setup_docker_mounts "$final_ws_root" "$share_dir" "$cache_dir"
    
    echo "Starting serve for '$project_name' on port $port..."
    
    docker run -d \
        --name "$container_name" \
        --network host \
        --restart unless-stopped \
        -e "HOST_UID=$(id -u)" \
        -e "HOST_GID=$(id -g)" \
        "${DOCKER_MOUNTS[@]}" \
        -v "$abs_target:/project:rw" \
        "$IMAGE_NAME" opencode serve --port "$port" --hostname 0.0.0.0 --print-logs
    
    if ! wait_for_serve "$port"; then
        echo "Error: Serve failed to start within 30 seconds"
        echo "Container logs:"
        docker logs "$container_name" 2>&1 | tail -20
        exit 1
    fi
    
    echo "$container_name"
}

# 启动后台 serve 服务
run_serve() {
    local target_dir="$1"
    [ -z "$target_dir" ] && echo "Error: Target directory is required." && echo "Usage: $0 serve <子项目路径>" && exit 1
    
    local abs_target
    abs_target="$(validate_target_dir "$target_dir")" || exit 1
    validate_project_dir "$abs_target" || exit 1
    
    local project_name=$(basename "$abs_target")
    ensure_image
    
    local port
    port="$(find_available_port)" || exit 1
    
    local container_name="sandbox-serve-${project_name}-${port}"
    if docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
        echo "Error: Container '$container_name' already exists."
        echo "Use '$0 serve stop ${project_name}' to stop it first."
        exit 1
    fi
    
    init_project_storage "$project_name"
    
    start_serve_container "$abs_target" "$project_name" "$SHARE_DIR" "$CACHE_DIR" "$port" >/dev/null
    
    local url="http://127.0.0.1:$port"
    echo ""
    echo "✓ Serve is running!"
    echo "  URL:       $url"
    echo "  Container: $container_name"
    echo "  Project:   $project_name"
    echo "  Storage:   $STORAGE_BASE/$project_name"
    echo ""
    echo "To stop: $0 serve stop ${project_name}"
    echo "To list: $0 serve list"
    
    open "$url"
}

# 停止 serve 服务
stop_serve() {
    local input="$1"
    [ -z "$input" ] && echo "Error: Project name is required." && echo "Usage: $0 serve stop <项目名>" && exit 1
    
    # 如果是路径则转换为绝对路径后提取 basename
    local project_name
    if [[ "$input" == */* ]] || [ "$input" = "." ] || [ -d "$input" ]; then
        project_name=$(basename "$(cd "$input" 2>/dev/null && pwd)" 2>/dev/null || echo "$input")
    else
        project_name="$input"
    fi
    
    local containers
    containers=$(get_serve_containers "$project_name" "-a")
    
    [ -z "$containers" ] && echo "Error: No serve found for project '$project_name'." && exit 1
    
    local count=$(echo "$containers" | wc -l | tr -d ' ')
    
    if [ "$count" -gt 1 ]; then
        echo "Error: Multiple serves found for project '$project_name':"
        echo ""
        local name
        for name in $containers; do
            echo "  - $name (port: $(extract_port "$name"), status: $(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null))"
        done
        echo ""
        echo "Use 'docker stop <container_name>' to stop a specific one."
        exit 1
    fi
    
    local container_name=$(echo "$containers" | head -1)
    echo "Stopping '$container_name'..."
    
    docker stop "$container_name" >/dev/null 2>&1
    docker rm "$container_name" >/dev/null
    
    echo "✓ Container '$container_name' stopped and removed."
}

# 列出运行中的 serve 实例
list_serve() {
    local containers=$(docker ps --filter "name=sandbox-serve-" --format "{{.Names}}\t{{.Status}}" 2>/dev/null)
    
    [ -z "$containers" ] && echo "No running serve instances." && return 0
    
    echo "Running serve instances:"
    echo ""
    printf "  %-30s %-10s %-15s %s\n" "PROJECT" "PORT" "STATUS" "CONTAINER"
    echo "  ------------------------------------------------------------------------"
    
    local name status port project
    while IFS=$'\t' read -r name status; do
        port=$(extract_port "$name")
        project=$(echo "$name" | sed 's/sandbox-serve-//' | sed "s/-${port}$//")
        printf "  %-30s %-10s %-15s %s\n" "$project" "$port" "$status" "$name"
    done <<< "$containers"
    
    echo ""
    echo "Stop command:   $0 serve stop <项目名>"
    echo "Logs command:   $0 serve logs <项目名>"
    echo "Enter command:  $0 serve enter <项目名>"
    echo "Prune command:  $0 serve prune <项目名>"
}

# 清理项目存储
prune_storage() {
    local input="$1"
    [ -z "$input" ] && echo "Error: Project name is required." && echo "Usage: $0 serve prune <项目名>" && exit 1
    
    # 如果是路径则转换为绝对路径后提取 basename
    local project_name
    if [[ "$input" == */* ]] || [ "$input" = "." ] || [ -d "$input" ]; then
        project_name=$(basename "$(cd "$input" 2>/dev/null && pwd)" 2>/dev/null || echo "$input")
    else
        project_name="$input"
    fi
    
    local containers=$(get_serve_containers "$project_name")
    [ -n "$containers" ] && echo "Error: Serve is running for '$project_name'. Stop it first." && echo "Use: $0 serve stop ${project_name}" && exit 1
    
    local storage_dir="$STORAGE_BASE/$project_name"
    [ ! -d "$storage_dir" ] && echo "No storage found for project '$project_name'." && exit 0
    
    echo "Removing storage for '$project_name'..."
    rm -rf "$storage_dir"
    echo "✓ Storage removed: $storage_dir"
}

# 查看 serve 日志
logs_serve() {
    local input="$1"
    [ -z "$input" ] && echo "Error: Project name is required." && echo "Usage: $0 serve logs <项目名>" && exit 1
    
    # 如果是路径则转换为绝对路径后提取 basename
    local project_name
    if [[ "$input" == */* ]] || [ "$input" = "." ] || [ -d "$input" ]; then
        project_name=$(basename "$(cd "$input" 2>/dev/null && pwd)" 2>/dev/null || echo "$input")
    else
        project_name="$input"
    fi
    
    local containers=$(get_serve_containers "$project_name" "-a")
    [ -z "$containers" ] && echo "Error: No serve found for project '$project_name'." && exit 1
    
    local count=$(echo "$containers" | wc -l | tr -d ' ')
    [ "$count" -gt 1 ] && echo "Error: Multiple serves found. Use 'docker logs <container_name>' directly." && exit 1
    
    local container_name=$(echo "$containers" | head -1)
    
    if [ "$2" = "-f" ] || [ "$2" = "--follow" ]; then
        docker logs -f "$container_name"
    else
        docker logs "$container_name" 2>&1 | tail -100
        echo ""
        echo "Use '$0 serve logs $project_name -f' to follow logs"
    fi
}

# 进入 serve 容器的 bash
enter_serve() {
    local input="$1"
    [ -z "$input" ] && echo "Error: Project name is required." && echo "Usage: $0 serve enter <项目名>" && exit 1
    
    # 如果是路径则转换为绝对路径后提取 basename
    local project_name
    if [[ "$input" == */* ]] || [ "$input" = "." ] || [ -d "$input" ]; then
        project_name=$(basename "$(cd "$input" 2>/dev/null && pwd)" 2>/dev/null || echo "$input")
    else
        project_name="$input"
    fi
    
    local containers
    containers=$(get_serve_containers "$project_name")
    
    if [ -z "$containers" ]; then
        echo "Error: No running serve found for project '$project_name'."
        echo "Use '$0 serve <项目路径>' to start one."
        exit 1
    fi
    
    local container_name
    local count=$(echo "$containers" | wc -l | tr -d ' ')
    
    if [ "$count" -gt 1 ]; then
        echo "Multiple serves found for project '$project_name':"
        echo ""
        local i=1 name
        while IFS= read -r name; do
            local port=$(extract_port "$name")
            local status=$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null)
            echo "  $i) $name (port: $port, status: $status)"
            i=$((i + 1))
        done <<< "$containers"
        echo ""
        read -p "Select container to enter [1-$count]: " choice
        
        if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "$count" ]; then
            echo "Invalid selection."
            exit 1
        fi
        
        container_name=$(echo "$containers" | sed -n "${choice}p")
    else
        container_name=$(echo "$containers" | head -1)
    fi
    
    echo "Entering container: $container_name"
    docker exec -it -u coder "$container_name" bash
}

# 执行 TUI 模式：serve + attach
run_tui() {
    local target_dir="$1"
    [ -z "$target_dir" ] && echo "Error: Target directory is required." && echo "Usage: $0 tui <子项目路径>" && exit 1
    
    local abs_target
    abs_target="$(validate_target_dir "$target_dir")" || exit 1
    validate_project_dir "$abs_target" || exit 1
    
    local project_name=$(basename "$abs_target")
    ensure_image
    
    init_project_storage "$project_name"
    
    local containers=$(get_serve_containers "$project_name")
    local serve_port
    
    if [ -z "$containers" ]; then
        echo "No serve running for '$project_name'. Starting one..."
        
        local port
        port="$(find_available_port)" || exit 1
        
        start_serve_container "$abs_target" "$project_name" "$SHARE_DIR" "$CACHE_DIR" "$port" >/dev/null
        serve_port="$port"
        echo "✓ Serve started on port $serve_port"
    else
        local count=$(echo "$containers" | wc -l | tr -d ' ')
        
        if [ "$count" -gt 1 ]; then
            echo "Error: Multiple serves found for project '$project_name':"
            local name
            for name in $containers; do
                echo "  - $name (port: $(extract_port "$name"))"
            done
            echo ""
            echo "Please stop extra serves or connect manually: opencode attach http://127.0.0.1:<port>"
            exit 1
        fi
        
        serve_port=$(extract_port "$containers")
        echo "✓ Found running serve on port $serve_port"
    fi
    
    echo ""
    echo "Connecting to serve..."
    echo "Press Ctrl+C to exit (serve will continue running)"
    echo ""
    
    opencode attach "http://127.0.0.1:$serve_port"
}

# 执行孤立授权
run_auth() {
    ensure_image
    mkdir -p "$HOME/.local/share/opencode" "$HOME/.config/opencode"
    
    docker run -it --rm --network host \
        -e "HOST_UID=$(id -u)" \
        -e "HOST_GID=$(id -g)" \
        -v "$HOME/.local/share/opencode:/home/coder/.local/share/opencode:rw" \
        -v "$HOME/.config/opencode:/home/coder/.config/opencode:rw" \
        "$IMAGE_NAME" opencode auth login
}

# 核心实战调用引擎：沙箱起飞！
run_sandbox() {
    local target_dir="$1"
    [ -z "$target_dir" ] && echo "Error: Target directory is required." && show_help && exit 1
    shift
    
    local abs_target
    abs_target="$(validate_target_dir "$target_dir")" || exit 1
    validate_project_dir "$abs_target" || exit 1
    
    echo "Starting Agent Sandbox isolated to: $abs_target"
    ensure_image
    
    local project_name=$(basename "$abs_target")
    init_project_storage "$project_name"
    
    local final_ws_root
    final_ws_root="$(find_workspace_root "$abs_target")"
    
    mkdir -p "$HOME/.config/opencode"
    
    setup_docker_mounts "$final_ws_root" "$SHARE_DIR" "$CACHE_DIR"
    
    local container_name="sandbox-${project_name}-$RANDOM"
    
    local -a container_cmd=()
    if [ $# -eq 0 ]; then
        container_cmd=(opencode)
    elif [[ "$1" == -* ]]; then
        container_cmd=(opencode "$@")
    else
        container_cmd=("$@")
    fi

    docker run -it --rm \
        --name "$container_name" \
        --network host \
        -e "HOST_UID=$(id -u)" \
        -e "HOST_GID=$(id -g)" \
        -e "TERM=${TERM:-xterm-256color}" \
        "${DOCKER_MOUNTS[@]}" \
        -v "$abs_target:/project:rw" \
        "$IMAGE_NAME" "${container_cmd[@]}"
}

# 脚本命令行派发系统
main() {
    local cmd="${1:-}"
    case "$cmd" in
        run) shift; run_sandbox "$@" ;;
        tui) shift; run_tui "$@" ;;
        serve)
            shift
            case "${1:-}" in
                stop)  shift; stop_serve "$@" ;;
                list)  list_serve ;;
                logs)  shift; logs_serve "$@" ;;
                enter) shift; enter_serve "$@" ;;
                prune) shift; prune_storage "$@" ;;
                "")    
                    echo "Error: Missing argument for 'serve'."
                    echo "Usage: $0 serve <子项目路径>"
                    echo "       $0 serve stop <项目名>"
                    echo "       $0 serve list"
                    echo "       $0 serve logs <项目名>"
                    echo "       $0 serve enter <项目名>"
                    echo "       $0 serve prune <项目名>"
                    exit 1
                    ;;
                *) run_serve "$@" ;;
            esac
            ;;
        build) build_image ;;
        auth)  run_auth ;;
        help|--help|-h|"") show_help ;;
        *)
            echo "Unknown command: $cmd"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
