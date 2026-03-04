# @wopal/process

独立的进程管理工具,提供后台进程和交互式进程的管理能力。

## 特性

- ✅ 后台执行命令
- ✅ 会话生命周期管理(创建/查询/终止/清理)
- ✅ 日志管理(实时输出、滚动窗口、自动截断)
- ✅ PTY 支持(交互式进程)
- ✅ 输入交互(向运行中的进程发送输入)
- ✅ 进程隔离(独立的环境变量和工作目录)

## 安装

```bash
# 在 projects/agent-tools/tools/process/ 目录下
npm install
npm link
```

## 快速开始

### CLI 使用

```bash
# 启动后台进程
process-adapter start "npm run build"

# 启动带选项的进程
process-adapter start "python script.py" --cwd /path/to/project --env NODE_ENV=production

# 列出所有会话
process-adapter list

# 列出运行中的会话
process-adapter list running

# 查看会话输出
process-adapter log <sessionId>

# 分页查看(最后100行)
process-adapter log <sessionId> --limit 100

# 从第50行开始查看
process-adapter log <sessionId> --offset 50

# 检查会话状态
process-adapter poll <sessionId>

# 终止会话
process-adapter kill <sessionId>

# 清除已完成的会话
process-adapter clear <sessionId>

# 终止或清除会话
process-adapter remove <sessionId>
```

### API 使用

```javascript
const { ProcessManager } = require('@wopal/process');

const manager = new ProcessManager();

// 启动会话
const sessionId = manager.start('npm run build', {
  cwd: '/path/to/project',
  env: { NODE_ENV: 'production' },
  name: 'build-task'
});

// 查询状态
const status = manager.poll(sessionId);
console.log(status);
// { running: boolean, exitCode: number | null, output: string }

// 读取日志
const output = manager.log(sessionId, { limit: 100, offset: 0 });

// 终止会话
manager.kill(sessionId);

// 清理
manager.clear(sessionId);
```

## 命令参考

### `start <command> [options]`

启动后台进程。

**选项:**
- `--cwd <dir>` - 工作目录
- `--env <key=value>` - 环境变量(可多次使用)
- `--name <name>` - 会话名称

### `list [filter]`

列出所有会话。

**参数:**
- `filter` - 筛选条件: `all`(默认), `running`, `finished`

### `log <sessionId> [options]`

查看会话输出。

**选项:**
- `--limit <n>` - 显示最后 N 行(默认: 200)
- `--offset <n>` - 从第 N 行开始

### `poll <sessionId>`

检查会话状态。

### `kill <sessionId>`

终止会话(SIGTERM)。

### `clear <sessionId>`

清除已完成的会话。

### `remove <sessionId>`

终止或清除会话(运行中则 kill,否则 clear)。

## API 参考

### `ProcessManager`

#### `start(command, options)`

启动后台进程。

**参数:**
- `command` (string) - 要执行的命令
- `options` (object) - 选项
  - `cwd` (string) - 工作目录
  - `env` (object) - 环境变量
  - `name` (string) - 会话名称
  - `tags` (array) - 会话标签

**返回:** `string` - 会话 ID

#### `poll(sessionId)`

查询会话状态。

**返回:** `object | null`
```javascript
{
  running: boolean,
  exitCode: number | null,
  output: string
}
```

#### `log(sessionId, options)`

读取会话日志。

**参数:**
- `sessionId` (string) - 会话 ID
- `options` (object)
  - `limit` (number) - 行数限制(默认: 200)
  - `offset` (number) - 起始行(默认: 0)

**返回:** `string | null`

#### `kill(sessionId, signal)`

终止会话。

**参数:**
- `sessionId` (string) - 会话 ID
- `signal` (string) - 信号(默认: 'SIGTERM')

**返回:** `boolean`

#### `clear(sessionId)`

清除已完成的会话。

**返回:** `boolean`

#### `remove(sessionId)`

终止或清除会话。

**返回:** `boolean`

#### `list(filter)`

列出会话。

**参数:**
- `filter` (string) - 筛选条件: 'all', 'running', 'finished'

**返回:** `array`

## 架构

```
┌─────────────────────────────────────────┐
│           CLI Layer (cli.js)            │
│  - Command parsing                      │
│  - User interaction                     │
└──────────────┬──────────────────────────┘
                │
┌──────────────▼──────────────────────────┐
│      ProcessManager (manager.js)        │
│  - Session lifecycle management         │
│  - API coordination                     │
└──────────────┬──────────────────────────┘
                │
        ┌───────┴───────┐
        │               │
┌──────▼──────┐  ┌────▼─────┐
│  Executor   │  │   PTY    │
│ (普通执行)  │  │ Executor │
│  spawn()    │  │ (交互式) │
│             │  │ node-pty │
└──────┬──────┘  └────┬─────┘
        │               │
        └───────┬───────┘
                │
┌──────────────▼──────────────────────────┐
│        ProcessSession (session.js)      │
│  - Session state & output buffer        │
│  - Auto-truncate (10MB)                 │
└──────────────┬──────────────────────────┘
                │
┌──────────────▼──────────────────────────┐
│      ProcessRegistry (registry.js)      │
│  - In-memory session storage            │
│  - File-based metadata (/tmp/)          │
└─────────────────────────────────────────┘
```

## 开发

```bash
# 安装依赖
npm install

# 运行测试
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration
```

## 故障排查

### 会话列表为空

检查临时目录:
```bash
ls /tmp/agent_sessions/
ls /tmp/agent_logs/
```

### 进程无法终止

使用 `remove` 命令强制清理:
```bash
process-adapter remove <sessionId>
```

### 日志文件过大

会话会自动截断超过 10MB 的日志文件,保留尾部内容。

## 许可证

MIT
