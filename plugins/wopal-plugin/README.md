# wopal-plugin — Wopal OpenCode 插件

Wopal 专用的 OpenCode 插件，提供规则注入与非阻塞任务委派能力。

## 功能

- **规则注入**：自动发现 Markdown 规则文件并注入系统提示词
- **任务委派**：异步启动子代理执行后台任务
- **双向通信**：子代理提问时父代理可回复继续执行
- **权限代理**：子会话权限请求自动授权

## 工具集

| 工具 | 用途 |
|------|------|
| `wopal_task` | 启动后台任务（异步，立即返回 task_id） |
| `wopal_output` | 查询任务状态、进度、完整历史 |
| `wopal_cancel` | 取消运行中的任务 |
| `wopal_reply` | 向等待中的任务发送消息恢复执行 |

## 快速开始

### 启动后台任务

```
wopal_task(
  description="实现用户认证模块",
  prompt="实现 JWT 认证，包含登录、注册、刷新 token 接口",
  agent="fae"
)
```

返回：`{ ok: true, taskId: "wopal-task-xxx", status: "running" }`

### 查询任务状态

```
wopal_output(task_id="wopal-task-xxx")
```

返回：状态 + 进度统计 + （waiting 状态自动显示完整历史）

### 恢复等待中的任务

当收到 `[WOPAL TASK WAITING]` 通知：

```
wopal_reply(
  task_id="wopal-task-xxx",
  message="继续执行方案 A，使用 bcrypt 加密密码"
)
```

## 双向通信

### 状态流转

```
running → session.idle → diagnoseIdle() → {completed | waiting | error}
         ↑                                           │
         │                                           ↓
         └─────── wopal_reply ←── [WOPAL TASK WAITING]
```

### 通知格式

| 状态 | 通知标记 | 说明 |
|------|---------|------|
| `completed` | `[WOPAL TASK COMPLETED]` | 任务完成 |
| `waiting` | `[WOPAL TASK WAITING]` | 子代理提问，等待回复 |
| `error` | `[WOPAL TASK ERROR]` | 任务异常 |

## 架构

```
src/
├── index.ts              # 插件入口
├── simple-task-manager.ts # 任务管理器
├── idle-diagnostic.ts    # Idle 状态诊断
├── permission-proxy.ts   # 权限自动代理
├── question-relay.ts     # Question Tool 中继
├── runtime.ts            # 事件钩子
└── tools/
    ├── wopal-task.ts
    ├── wopal-output.ts
    ├── wopal-cancel.ts
    └── wopal-reply.ts
```

## 开发

```bash
# 测试
npm run test:run

# 类型检查
npx tsc --noEmit

# 调试日志
WOPAL_PLUGIN_DEBUG=1
```

## 注意事项

- 子会话无 TUI，权限请求自动授权
- `waiting` 状态不释放并发槽，恢复后继续执行
- 使用 `createDebugLog()` 而非 `console.log`

详细规范见 [AGENTS.md](./AGENTS.md)