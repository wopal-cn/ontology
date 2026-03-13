# 使用 Debian slim 作为轻量级的 Linux 基础镜像
FROM debian:bookworm-slim

# 定义可配置的工具版本参数
ARG NVM_VERSION=v0.40.1
ARG GO_VERSION=1.23.4
ARG SANDBOX_VERSION=1.0.0

# 安装基础依赖包和 AI 智能体编码时常用的系统工具
# 包含 Playwright Chromium 所需的系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl bash ca-certificates sudo zip unzip wget gnupg \
    lsb-release apt-transport-https software-properties-common \
    ripgrep fd-find jq tree less procps tmux lsof make iputils-ping \
    python3 python3-pip python3-venv xz-utils docker.io \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# 创建 python 软链接（Debian 默认只有 python3）
RUN ln -sf /usr/bin/python3 /usr/bin/python && \
    ln -sf /usr/bin/pip3 /usr/bin/pip

# 安装 GitHub CLI (gh)
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

# 创建非 root 权限的默认用户 'coder'，并赋予其无密码执行 sudo 的权限
RUN useradd -m -s /bin/bash -u 1000 coder && \
    echo "coder ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# 切换到 coder 用户，针对此用户安装各项编程运行环境 (SDK)
USER coder
WORKDIR /home/coder

# 集中声明所有的环境变量，减少层次数和提高复用
ENV NVM_DIR="/home/coder/.nvm" \
    BUN_INSTALL="/home/coder/.bun" \
    RUSTUP_HOME="/home/coder/.rustup" \
    CARGO_HOME="/home/coder/.cargo" \
    GOPATH="/home/coder/go"
ENV PATH="/home/coder/.flutter-sdk/bin:$CARGO_HOME/bin:/usr/local/go/bin:$GOPATH/bin:$BUN_INSTALL/bin:$NVM_DIR/default:/home/coder/.local/bin:$PATH"

# 安装 Node.js (NVM), 原生 NPM 全局包
RUN curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash && \
    bash -c "source $NVM_DIR/nvm.sh && \
    nvm install --lts && \
    nvm alias default node && \
    nvm use default && \
    ln -sf \$(dirname \$(which node)) $NVM_DIR/default && \
    npm install -g @ast-grep/cli pnpm playwright && \
    npx playwright install chromium"

# 安装 uv 和 Bun
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    curl -fsSL https://bun.sh/install | bash

# 安装 Go 语言
USER root
RUN curl -OL https://go.dev/dl/go${GO_VERSION}.linux-$(dpkg --print-architecture).tar.gz && \
    tar -C /usr/local -xzf go${GO_VERSION}.linux-$(dpkg --print-architecture).tar.gz && \
    rm go${GO_VERSION}.linux-$(dpkg --print-architecture).tar.gz
USER coder

# 安装 Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path

# 安装 Flutter
RUN git clone https://github.com/flutter/flutter.git -b stable /home/coder/.flutter-sdk

# -----------------
# 频繁变动层分离
# 因为属于常更新的底层工具，为了避免破坏上方环境的层缓存被置于最后构建
# -----------------
ARG OPENCODE_BUILD_TIME=0
RUN bash -c "source $NVM_DIR/nvm.sh && npm install -g opencode-ai@latest"

# 针对基础环境目录进行权限平权
USER root
RUN mkdir -p /home/coder/.config/opencode \
    /home/coder/.local/share/opencode \
    /home/coder/.cache/opencode \
    /home/coder/.cache/oh-my-opencode \
    /home/coder/.npm \
    /home/coder/go \
    /shared/opencode/commands \
    /shared/opencode/plugins \
    /shared/opencode/rules \
    /shared/opencode/skills \
    /shared/opencode/agents \
    && chown -R coder:coder /home/coder /shared

# 将 /project 指定为容器进入后的默认工作目录（此目录会作为宿主机的项目挂载点）
WORKDIR /project

# 复制入口处理脚本并赋予可执行权限
LABEL org.opencontainers.image.version="${SANDBOX_VERSION}" \
      org.opencontainers.image.title="Wopal Agent Sandbox" \
      org.opencontainers.image.description="Isolated Docker sandbox for AI agents"

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD pgrep -f "opencode serve" >/dev/null || exit 1

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# 设定入口点。所有命令在执行前都会先跳入 entrypoint.sh 做权限桥接处理
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
# 在没有额外提供指令时，默认启动 opencode
CMD ["opencode"]
