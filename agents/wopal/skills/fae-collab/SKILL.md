---
name: fae-collab
  description: |
    Wopal 与 Fae 协作的完整生命周期指南。⚠️ **MUST load before ANY delegation to fae** — 委派、检查、监控、验证、收尾全覆盖。🔴 Trigger: "委派"、"delegate"、"让 fae 执行"、"fae 任务"、"检查 fae 状态"、"取消任务"、"fae 协作"、或任何意图将任务交给 fae 执行的场景。**严禁不加载本技能就直接委派任务给 fae，这是严重失职。**
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

验证边界已整合到「最佳实践 → 验证边界」中，请参考该章节。

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

### 委派策略

**异步优先**：有可能就用异步委托（`wopal_task`），同步委托（Task Tool）仅用于极简短任务（<2 分钟、明确无歧义）。异步的好处：fae 执行上下文不占用 Wopal 上下文、可并行多任务、Wopal 保留空间用于验证结果。

**任务分组并行**：将无依赖关系的任务分组，并行异步委托。有依赖的串行，但组内尽量并行。例如：
- 并行组 1：复制文件 + 编写模板（无依赖）
- 组 2：编写核心文件（依赖组 1 产出）
- 并行组 3：安装 + 配置（依赖组 2 产出，但组内可并行）

**委派 ROI**：委派成本 = prompt 描述 + fae 上下文 + 验证读取。评估是否值得委派：
- 简单编辑（<5 处修改）、已读文件的修改 → Wopal 自己做
- 涉及自身行为的技能内容优化 → Wopal 自己做（需要深刻上下文理解）
- 通用技能开发、文件操作、代码编写 → 委派给 fae

### 任务消息规范

| 参数 | 规范 |
|------|------|
| description | 3-5 词 |
| prompt | 详细步骤 + 完成标准 + Task Report |
| timeout | 短任务默认，长任务显式设（最大 3600） |
| staleTimeout | 长测试设 600+ |

**记录 task_id**：用于检查、监控、取消

### 验证边界

| 验证类型 | 执行者 | 原因 |
|----------|--------|------|
| 单元测试、集成测试（代码级） | fae | 自动化、确定性、可重复 |
| E2E 测试、功能验证 | **Wopal** | 需要观察运行时环境 |
| 技能安装验证 | **Wopal** | 需要确认部署层正确加载 |
| 插件加载/事件流观测 | **Wopal** | 子会话无法观测父会话运行时 |

`completed` ≠ 成功，Wopal 必须读取文件、运行命令验证 fae 的产出。失败时提供反馈重新委派。

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
