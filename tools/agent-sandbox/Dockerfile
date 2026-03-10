# 使用 Debian slim 作为轻量级的 Linux 基础镜像
FROM debian:bookworm-slim

# 定义可配置的工具版本参数
ARG NVM_VERSION=v0.40.1
ARG GO_VERSION=1.23.4

# 安装基础依赖包和 AI 智能体编码时常用的系统工具
RUN apt-get update && apt-get install -y \
    git curl bash ca-certificates sudo zip unzip wget gnupg \
    lsb-release apt-transport-https software-properties-common \
    ripgrep fd-find jq tree less procps tmux lsof \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# 因为网络限制问题，直接通过 Debian 的默认软件源安装 Docker CLI（我们只需要客户端来连接系统 Docker）
RUN apt-get update && \
    apt-get install -y docker.io && \
    rm -rf /var/lib/apt/lists/*

# 创建非 root 权限的默认用户 'coder'，并赋予其无密码执行 sudo 的权限
RUN useradd -m -s /bin/bash -u 1000 coder && \
    echo "coder ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# 切换到 coder 用户，针对此用户安装各项编程运行环境 (SDK)
USER coder
WORKDIR /home/coder

# 安装 NVM (Node Version Manager) 以及稳定的 Node.js LTS 版本
ENV NVM_DIR="/home/coder/.nvm"
RUN curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash && \
    bash -c "source $NVM_DIR/nvm.sh && \
    nvm install --lts && \
    nvm alias default node && \
    nvm use default && \
    ln -sf \$(dirname \$(which node)) $NVM_DIR/default"

# 安装 uv（速度极快的 Python 包和项目管理器）
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# 安装 Go 语言（临时切换回 root 进行系统级解压，随后切回 coder）
USER root
RUN curl -OL https://golang.google.cn/dl/go${GO_VERSION}.linux-$(dpkg --print-architecture).tar.gz && \
    tar -C /usr/local -xzf go${GO_VERSION}.linux-$(dpkg --print-architecture).tar.gz && \
    rm go${GO_VERSION}.linux-$(dpkg --print-architecture).tar.gz
USER coder
ENV GOPATH="/home/coder/go"

# 安装 Bun（极速的 JavaScript 运行时和包管理器，能极大加速 JS 环境执行）
RUN curl -fsSL https://bun.sh/install | bash
ENV BUN_INSTALL="/home/coder/.bun"

# 安装 ast-grep，用于 oh-my-opencode 的 AST 语法树智能搜索与替换
RUN bash -c "source $NVM_DIR/nvm.sh && npm install -g @ast-grep/cli"

# 配置环境变量，把所有刚才安装的工具可执行文件加入 PATH 寻找路径中
ENV PATH="/usr/local/go/bin:$GOPATH/bin:$BUN_INSTALL/bin:$NVM_DIR/default:/home/coder/.local/bin:$PATH"

# 全局安装 OpenCode 智能体 CLI
ARG OPENCODE_BUILD_TIME=0
RUN bash -c "source $NVM_DIR/nvm.sh && npm install -g opencode-ai@latest"

USER root
# 预先创建必须的缓存和配置目录，并设置正确的所属的用户权限，以避免后续挂载后的权限报错
RUN mkdir -p /home/coder/.config/opencode \
    /home/coder/.local/share/opencode \
    /home/coder/.cache/opencode \
    /home/coder/.cache/oh-my-opencode \
    /home/coder/.npm \
    /home/coder/go \
    && chown -R coder:coder /home/coder

# 将 /workspace 指定为容器进入后的默认工作目录（此目录会作为宿主机的项目挂载点）
WORKDIR /workspace

# 复制入口处理脚本并赋予可执行权限
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# 设定入口点。所有命令在执行前都会先跳入 entrypoint.sh 做权限桥接处理
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
# 在没有额外提供指令时，默认启动 opencode
CMD ["opencode"]
