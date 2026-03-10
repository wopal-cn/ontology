#!/bin/bash
set -e

# --- 1. 处理 Docker 守护进程通讯套接字 (docker.sock) 权限 ---
# 如果主机的 docker socket 被成功映射到容器中，
# 为了让沙箱里面的用户可以无碍使用宿主的 Docker，我们需要给 coder 用户附加相应的 socket 组权限。
if [ -S /var/run/docker.sock ]; then
    # 读取被挂载进来的 socket 文件的真实宿主机组 ID (GID)
    DOCKER_SOCK_GID=$(stat -c '%g' /var/run/docker.sock)
    
    # 检测容器内是否已经存在该 ID 的组，若不存在，则动态建立一个名为 docker_host 的组
    if ! getent group "$DOCKER_SOCK_GID" >/dev/null 2>&1; then
        groupadd -g "$DOCKER_SOCK_GID" docker_host 2>/dev/null || true
    fi
    
    # 将内部的 coder 用户强行拉入这个 socket 用户组里，从而拿到执行宿主 docker 的权限
    usermod -aG "$DOCKER_SOCK_GID" coder 2>/dev/null || true
fi

# --- 2. 处理沙箱角色桥接 (Host User -> Container User 映射) ---
# 从环境变量中取得宿主机传入的外部当前用户的实际 UID 和 GID
TARGET_UID=${HOST_UID:-1000}
TARGET_GID=${HOST_GID:-1000}

# 获取容器内部 coder 默认拥有的 UID/GID
CURRENT_UID=$(id -u coder)
CURRENT_GID=$(id -g coder)

# 如果宿主机的使用者 UID/GID 与我们的预设配置不一致，
# 则我们在启动进程之前动态修改 coder 用户的 ID，使得它们严丝合缝地重叠映射。
if [ "$TARGET_UID" != "$CURRENT_UID" ] || [ "$TARGET_GID" != "$CURRENT_GID" ]; then
    if [ "$TARGET_GID" != "$CURRENT_GID" ]; then
        groupmod -g "$TARGET_GID" coder 2>/dev/null || true
    fi
    if [ "$TARGET_UID" != "$CURRENT_UID" ]; then
        # 强制将 coder 这个帐号背后的系统 UID 变更为宿主机的 UID
        usermod -u "$TARGET_UID" coder 2>/dev/null || true
    fi

    # 递归修正家目录下高频覆写的核心缓存文件夹的作用权，让已经换脸的 coder 重掌这些文件的权力
    chown "$TARGET_UID:$TARGET_GID" /home/coder 2>/dev/null || true
    chown -R "$TARGET_UID:$TARGET_GID" /home/coder/.config 2>/dev/null || true
    chown -R "$TARGET_UID:$TARGET_GID" /home/coder/.local 2>/dev/null || true
    chown -R "$TARGET_UID:$TARGET_GID" /home/coder/.cache 2>/dev/null || true
    # 彻底移除对 .nvm, go, .bun, .cargo, .rustup, .flutter-sdk 等巨大 SDK 与静态文件包的无脑 chown -R。
    # 因为这些文件哪怕属于 1000:1000 （即使未对准），由于其带有 +r 权限，也能在沙箱内被正常读取运行，并极大减缓存写复制风暴。
fi

# 特别注意: 绝对不接触和修改 /workspace 挂载点下的权限。
# 该目录是源自于宿主的源码子项目，在桥接好 UID/GID 之后，内部程序读写它如同宿主用户亲临，无需再额外夺权。

# --- 3. 环境变量固定与执行权交接 ---
# 确保接下来跑起来的程序的相对家目录指向 /home/coder 
export HOME=/home/coder
export USER=coder
export NVM_DIR="/home/coder/.nvm"

# 使用 setpriv 剥离 root 最高身份，平权并附加上所有的附加组权限（包括前面拿到的 docker socket 组）；
# 并在接管前 source nvm 脚本当作环境热身，接着把控制权 (exec) 以子用户的身份正式移交给用户传入的命令（例如 opencode）。
exec setpriv --reuid="$TARGET_UID" --regid="$TARGET_GID" --init-groups \
    bash -c "source \$NVM_DIR/nvm.sh 2>/dev/null || true && exec \"\$@\"" \
    -- "$@"
