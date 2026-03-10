#!/bin/bash
set -e

# Wopal Agent Sandbox Runner (Wopal 专属智能体沙箱执行器)
# 核心作用: 将宿主体内指定的一个子项目绝对隔离地挂载进安全容器，阻止 Agent 访问全局空间。

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
IMAGE_NAME="wopal-agent-sandbox:latest"

# 打印帮助信息函数
show_help() {
    cat << EOF
Wopal Agent Sandbox CLI

用法: $0 [命令] [参数]

命令选项:
    run <子项目路径>  将指定的项目挂载至安全沙箱中执行 OpenCode
    build             构建 Wopal Agent 沙箱专用的 Docker 运行镜像
    auth              快速进入沙箱进行 OpenCode 登录验证并保存授权
    clean             删除机器上现有的沙箱 Docker 镜像
    help              显示这条帮助信息

关于 'run' 命令的参数说明:
    <子项目路径>   要隔离的子孙级项目或 worktree 的路径。(警告: 绝对不可以是工作空间的根目录)

调用示例:
    $0 run projects/python/flex-scheduler
    $0 run .worktrees/cli-feature-sandbox
EOF
}

# 向上追溯查找当前所在的挂载根工作空间点（依托于 .workspace.md 标识文件的存在）
find_workspace_root() {
    local dir="$(cd "$1" && pwd 2>/dev/null || echo "$PWD")"
    while [ "$dir" != "/" ] && [ ! -f "$dir/.workspace.md" ]; do
        dir="$(dirname "$dir")"
    done
    
    # 找寻到系统根部也没摸索到标记的话抛出致命错误
    if [ "$dir" == "/" ]; then
        echo "Error: Could not find .workspace.md to determine workspace root." >&2
        return 1
    fi
    echo "$dir"
}

# 核心安全拦截器：防止 Agent 越光整个空间或恶意进行上挂载
validate_target_dir() {
    local target="$1"
    
    if [ ! -d "$target" ]; then
        echo "Error: Directory '$target' does not exist." >&2
        exit 1
    fi
    
    # 将指定路径转化为系统绝对路径
    local abs_target="$(cd "$target" && pwd)"
    
    local ws_root
    if ! ws_root="$(find_workspace_root "$abs_target")"; then
        exit 1
    fi
    
    # 【安全拦截 1号】：如果要挂载的就是 Wopal 大盘子根目录，直接断供报错，确保结界的存在意义。
    if [ "$abs_target" == "$ws_root" ]; then
        echo "Error: Mounting the workspace root is strictly prohibited! The sandbox must target a specific subproject." >&2
        exit 1
    fi

    # 【安全拦截 2号】：如果要挂载的压根就在工作空间包围圈外，直接阻拦。
    if [[ ! "$abs_target" == "$ws_root"/* ]]; then
        echo "Error: Target directory '$abs_target' is outside the workspace root '$ws_root'." >&2
        exit 1
    fi
    
    # 所有筛查通过后，放回这个安全可用的绝对路径
    echo "$abs_target"
}

# 执行镜像构建指令
build_image() {
    echo "Building $IMAGE_NAME..."
    docker build -t "$IMAGE_NAME" "$SCRIPT_DIR"
}

# 摘除删除镜像指令
clean_image() {
    if docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
        echo "Removing Docker image '$IMAGE_NAME'..."
        docker rmi "$IMAGE_NAME"
    else
        echo "Docker image '$IMAGE_NAME' does not exist."
    fi
}

# 执行孤立授权：当需要输入 provider API Key 等信息登录时提供的一键式认证通道
run_auth() {
    if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
        echo "Image not found. Building first..."
        build_image
    fi
    
    # 该目录主要用于安全挂载存放 Auth 会话等状态缓存
    mkdir -p "$HOME/.local/share/opencode"
    mkdir -p "$HOME/.config/opencode"
    
    # 启动网络和交互端映射，进行 login 进程
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
    if [ -z "$target_dir" ]; then
        echo "Error: Target directory is required."
        show_help
        exit 1
    fi
    shift  # 移出第一项，留下的参数全是被注入的后缀执行令
    
    local abs_target
    # 如果路径检查失败（返回非 0 报错），则停止执行直接抛错并退出栈
    if ! abs_target="$(validate_target_dir "$target_dir")"; then
        echo "$abs_target" >&2
        exit 1
    fi
    echo "Starting Agent Sandbox isolated to: $abs_target"
    
    # 无镜像时，全自动进入懒人自动静默编译
    if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
        echo "Image not found. Building first..."
        build_image
    fi
    
    # 判断并创建必备的跨沙箱环境本地授权共享文件夹
    mkdir -p "$HOME/.local/share/opencode"
    mkdir -p "$HOME/.config/opencode"
    
    # 生成防冲突且直观的沙箱启动随机实例名称
    local container_name="sandbox-$(basename "$abs_target")-$RANDOM"
    
    # 动态指令拦截挂载：使得既可以执行命令式调用，也可以直接指定调用特定入口，还可以带走其余传参。
    local -a container_cmd=()
    if [ $# -eq 0 ]; then
        container_cmd=(opencode)
    elif [[ "$1" == -* ]]; then
        container_cmd=(opencode "$@")
    else
        container_cmd=("$@")
    fi

    # 结界成型
    # 特别说明挂载逻辑： 
    #   - 传入的孤岛子项目：挂载为可读可写的主战场 /workspace。
    #   - ~/.local/share/opencode：读写挂载用来分享认证令牌，以免反复登录。
    #   - ~/.config/opencode：主机的工作区统筹设定强行以 `只读(ro)` 模式丢进去，让 Agent 使用 Provider，且绝不能从内部将其改写。
    #   - docker.sock 挂载提供同位 Docker in Docker 管理权。
    docker run -it --rm \
        --name "$container_name" \
        --network host \
        -e "HOST_UID=$(id -u)" \
        -e "HOST_GID=$(id -g)" \
        -e "TERM=${TERM:-xterm-256color}" \
        -v "$abs_target:/workspace:rw" \
        -v "$HOME/.local/share/opencode:/home/coder/.local/share/opencode:rw" \
        -v "$HOME/.config/opencode:/home/coder/.config/opencode:ro" \
        -v "/var/run/docker.sock:/var/run/docker.sock:rw" \
        "$IMAGE_NAME" "${container_cmd[@]}"
}

# 脚本命令行派发系统
main() {
    local cmd="${1:-}"
    case "$cmd" in
        run)
            shift
            run_sandbox "$@"
            ;;
        build)
            build_image
            ;;
        auth)
            run_auth
            ;;
        clean)
            clean_image
            ;;
        help|--help|-h|"")
            show_help
            ;;
        *)
            echo "Unknown command: $cmd"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
