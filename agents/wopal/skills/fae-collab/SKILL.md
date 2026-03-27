---
name: fae-collab
description: Wopal 与 Fae 协作的完整生命周期指南。覆盖委派、检查、监控、异常处理、验证、收尾六环节。触发于"委派"、"delegate"、"让 fae 执行"、"fae 任务"、"检查 fae 状态"、"取消任务"、"fae 协作"。
---

# Fae 协作

```
委派 → 检查 → 监控 → 异常处理 → 验证 → 收尾
```

---

## 两种模式

| 维度 | CLI 沙箱模式 | 插件模式 |
|------|-------------|----------|
| **Fae 视野** | `/project/` 单项目 | 整个空间 |
| **委派** | `wopal fae task start` | `wopal_task()` |
| **检查** | `wopal fae task status` | `wopal_output()` |
| **监控** | `wopal fae task wait` | 等待通知 |
| **交互** | `wopal fae stream` ✅ | ❌ |
| **适用** | 长任务、需交互 | 快速短任务 |

**选择**：需交互或 >5分钟 → CLI；否则 → 插件

---

## 一、委派

### 1.1 CLI 沙箱模式

**视野限制**：Fae 只能看到 `/project/`

| Space 视角 | Fae 视角 |
|------------|----------|
| `projects/ontology/` | `/project/` |
| `.agents/skills/` | 不可见 |

```bash
wopal fae sandbox list --json
wopal fae sandbox start <project>
wopal fae session create --sandbox <project> --json
wopal fae task start <session-id> "<message>" --sandbox <project> --json
# 记录 task_id
```

### 1.2 插件模式

**视野**：整个空间（与 Wopal 相同）

```typescript
wopal_task({
  description: "3-5词",
  prompt: "<任务消息>",
  agent: "fae",
  timeout: 300,
  staleTimeout: 180
})
// 记录 task_id
```

**斜杠命令**：prompt 必须以 `/xxx` 开头才能触发
```typescript
prompt: "/commit\n\n创建 commit。"  // ✅ 正确
prompt: "执行 /commit 命令..."      // ❌ 不会触发
```

### 1.3 任务消息格式

```markdown
## 目标
<一句话>

## 文件
- /project/path/to/file.ts

## 步骤
1. 读取 /project/AGENTS.md
2. 修改文件
3. 运行：pnpm test

## 完成标准
- 功能验证通过

## Task Report
完成时输出：Goal/Accomplished/Files/Status
```

---

## 二、检查

### CLI
```bash
wopal fae task status <task-id> --json
```

### 插件
```typescript
wopal_output({ task_id: "wopal-task-xxx" })
// 返回 summary：status, messages, last activity, tool calls

// 按分类获取（控制上下文占用）：
wopal_output({ task_id, section: "tools" })       // 工具调用和结果
wopal_output({ task_id, section: "reasoning" })    // 思考过程
wopal_output({ task_id, section: "text" })         // 文本输出
wopal_output({ task_id, section: "reasoning", last_n: 3 })  // 只看最近 3 条
```

### 状态含义

| 状态 | 含义 | 下一步 |
|------|------|--------|
| pending | 排队中 | 等待 |
| running | 执行中 | 等待或监控 |
| completed | 已完成 | 验证产出 |
| error | 出错 | 检查日志 |
| cancelled | 已取消 | 确认 |

**进度判断**：消息数增长 → 执行中；长时间无新消息 → 可能卡住

---

## 三、监控

### CLI

```bash
wopal fae task wait <task-id> --timeout 300

# 中途交互
wopal fae stream <session-id> "<message>" --sandbox <project>

# 检查 OpenCode 状态
curl -s "http://localhost:<port>/session/status?directory=/project"
# busy=执行中, idle=完成
```

### 插件

**等待通知**，不要轮询：
```typescript
wopal_task({ ... })
// 记录 task_id，做其他事...
// 收到 [WOPAL TASK COMPLETED] 后
wopal_output({ task_id })  // 获取结果
```

### 超时

| 类型 | 阈值 | 处理 |
|------|------|------|
| wait timeout (CLI) | 用户设置 | 继续等待或取消 |
| timeout (插件) | 300s | 任务终止 |
| staleTimeout (插件) | 180s | 无活动后终止 |
| stuck detection (插件) | 120s | 通知 Wopal 检查 |

---

## 四、异常处理

### 任务卡住

收到 `[WOPAL TASK STUCK]` 通知时：
1. 用 `wopal_output({ task_id, section: "reasoning" })` 检查思考过程
2. 判断是否 reasoning 死循环或异常内容
3. 卡死 → `wopal_cancel({ task_id })`；正常推理 → 继续等待

### 取消

```bash
# CLI
wopal fae task cancel <task-id>

# 插件（仅 running 可取消）
wopal_cancel({ task_id: "wopal-task-xxx" })
```

### 重试

| 原因 | 处理 |
|------|------|
| stale timeout | 增加 staleTimeout 或用 CLI |
| 卡住 | 取消重试，简化任务 |
| prompt 不明确 | 优化后重试 |

---

## 五、验证

**`completed` ≠ 成功**，必须验证产出：

1. 读取文件确认修改
2. 检查 Task Report
3. 运行测试

失败时：提供反馈，重新委派

---

## 六、收尾

### 汇报

向用户汇报：完成情况、修改文件、问题、后续建议

### 清理

```bash
wopal fae sandbox stop <project>
```

---

## 最佳实践

| 参数 | 规范 |
|------|------|
| description | 3-5 词 |
| prompt | 详细步骤 + 完成标准 + Task Report |
| timeout | 短任务默认，长任务显式设（最大 3600） |
| staleTimeout | 长测试设 600+ |

**记录 task_id**：用于检查、监控、取消

---

## 禁止与限制

| 禁止 | 原因 |
|------|------|
| 嵌套 wopal_task | 子代理已禁用 |
| 插件模式委派交互任务 | Fae 无法获得用户响应 |
| 同一 session 多任务 | 会混乱 |
| 监工模式 | fae 完成后 idle |
| 插件模式频繁轮询 | 浪费上下文 |

| 限制 | 应对 |
|------|------|
| stale timeout 180s | 长任务用 CLI 或设 staleTimeout |
| 并发最大 3 | 超出自动排队 |
| CLI 只见 /project/ | 路径翻译 |

---

## 故障排查

详见 `references/troubleshooting.md`
