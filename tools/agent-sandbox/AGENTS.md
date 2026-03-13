# Wopal Agent Sandbox 设计文档

`agent-sandbox` 是 Wopal 工作空间内的一套专用的轻量级 Docker 智能体沙盒。
它的核心目标是：为 AI 智能体（如 OpenCode）提供一个**开箱即用、绝对隔离、高度安全**的可执行环境，严格限制由于 Agent 脱缰可能引发的一系列安全危机或主工作区污染。

该功能基于优秀的开源项目 `opencode-dockerized` 提取与魔改而成，剃除了通用场景不必要的技术负债和繁琐交互，直击 Wopal 自身的刚需点。

## 一、核心设计哲学与隔离原则

1. **受限的工程防御与圈禁**
   沙箱的终极原则即是**工程级物理禁闭**与**不可篡改全局守则**。为此：
   - **禁止挂载工作区根目录 (`wopal-workspace/`)：** 哪怕是用户尝试 `sandbox.sh run .` 本脚本亦会直接捕获拦截。强制 Agent 只能在被指派的子项目或具体的 `worktree` 孤岛中工作。
   - **配置屏蔽与不可修改原则：** 为了防止 Agent 在隔离区内恶意读取或修改大盘的规则文件（例如 `AGENTS.md`, `SOUL.md`），或者试图给自己升权加入白名单。隔离机制保证了它除了 `~/.config/opencode` 和 `~/.gitconfig` 被**只读(ro)**强制挂载外，其它一无所知。
   
    > [!WARNING]
    > **安全声明妥协（Trade-off）：** 由于我们需要在沙箱内维持 Agent 对项目容器的管理甚至执行编译操作，本项目通过挂载 `/var/run/docker.sock` 采用了 Docker-in-Docker (DooD) 机制。需要坦陈的是：掌控了 docker.sock 便等同于掌握了宿主机的 root。虽然沙箱做了所有外围的约束，但若 Agent 恶意发作构造提权特权容器，**它仍有可能击穿防御**。此沙箱目前提供的更多是极佳的“工程级沙盒化工作流禁锢”，而非坚不可摧的最高安全结界。

2. **精简的技术栈法阵环境**
   相比源项目中携带 Java/SDKMAN、各种外围扩展的通用打包方式。该系统定制的 `Dockerfile` 贴近现代 Web / 工具链应用的实战需求：
   - 彻底移除对 Java 开发环境以及沉重包管理的依赖；
   - 包含快速开发与工具包依赖的大热门：Node.js (`nvm`), Go 环境, Python包管理机制 `uv`, `Rust` (`cargo`), `Flutter` (Dart) 以及极速 JS 运行时 `bun`。
   - 保留 `apt` 中常用的底层调试网络与数据流转的各类利刃 (`jq`, `curl`, `tree`, 等等)。
   - Docker-in-Docker 实战：内部只内置打通了同源宿主机通讯通道的 `docker.io` 客户端而无需内置拉起笨重的 `daemon` 守护，并且支持国内镜像源双切，资源利用极致且稳定。

## 二、沙箱架构与生命周期挂载分析

整个 Agent Sandbox 分成三个核心组成文件：

1. **`Dockerfile`：环境缔造基石**
    包含了系统底层的依赖拉取，环境变量配置；由于需要兼顾国内某些情况产生的网络阻断，将下载镜像仓库源指定在了如 `golang.google.cn` 的位置确保顺畅体验。同时，新建了非 root 的专享账号 `coder` （初始默认 UID=1000）。

2. **`entrypoint.sh`：神圣的角色平权与过门石**
    当容器运行时，它最初由宿主的 `root` 以最高权限被拉起，但这不安全。`entrypoint` 中做的两层核心过权为：
    - **UID/GID 重叠缝合**：获取通过 `sandbox.sh` 透传进来的宿主运行人 (sam) 的 `id -u` 及 `id -g`。用魔法修正内部账号 `coder` 的 ID 与之对应。这就保证了在容器内创建的、修改好的所有实体文件，落到宿主硬盘上权限完美隶属于正常宿主用户，而不是产生一系列尴尬的 `root-only` 未知文件。
    - **提权与接管(setpriv)**：最后关头，不再驻留 root 而是通过降维转换执行令将环境干净的过度到 `coder` 和我们指定的入口命令手里。

3. **`sandbox.sh`：拦截防波堤与控制枢纽台**
   最核心的用户态接入点脚本，它代替了各种零散命令。
   主要挂载清单详情：
   - `-v "$abs_target:/project:rw"`：被指派给它的当前任务**唯一主舞台**，全权可写。
   - `-v "$HOME/.local/share/opencode:/home/coder/.local/share/opencode:rw"`：存放你的身份状态与 Auth 信息的互通池，避免重启后丧失状态反复要求登录。
   - `-v "$HOME/.config/opencode:/home/coder/.config/opencode:ro"`：强制让沙箱可以读取但绝对无权更改你在大盘内设定的关于大模型 API Key 之类的高风险配置。只读锁死了其篡改意图。
   - `-v "/var/run/docker.sock:/var/run/docker.sock:rw"`：透传宿主机物理引擎。

## 三、快速开始

目前，沙箱工具位于 `projects/agent-tools/tools/agent-sandbox/sandbox.sh`。

### 安装与构建
如首次在此系统里使用，需要进行法阵编译：
```bash
./sandbox.sh build
```
（这会在本地拉起约为 1GB+ 的 Wopal 定制底层镜像 `wopal-agent-sandbox:latest`）

### 场景演示

**召唤带有权限圈禁的 OpenCode 对某项目文件分析**：
```bash
./sandbox.sh run projects/python/flex-scheduler opencode "帮我检查当前目录，寻找并优化能看得到的冗余内容"
```

**进入容器测试（体验环境视角）**：
```bash
./sandbox.sh run projects/agent-tools bash
```
