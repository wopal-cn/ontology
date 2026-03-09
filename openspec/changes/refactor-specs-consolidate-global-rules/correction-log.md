# 方案修正记录

## 原始方案的问题

**错误理解 1**：将全局 CLI UX 规范放在 `rules.specs` 中

**问题分析**：
1. `rules.specs` 注入到"生成 spec 的指令中"
2. 如果放在 `rules.specs`，AI Agent 在编写 spec 时会收到这些系统行为规范
3. 可能会在每个 spec 中重复添加这些系统行为需求
4. 这与我们要解决的问题（消除重复）背道而驰

**现有 `rules.specs` 的正确用途**：
- 只包含关于**如何编写 spec 文件的规范**（命名、标题格式、一致性检查等）
- 这些规则指导 AI Agent 如何组织 spec 文件本身
- 例如："Spec directory names MUST follow the Capability naming convention..."

## 第一次修正（仍不完美）

**修正方案 1**：将全局规范放在 `rules.design` 和 `rules.tasks` 中

**问题分析**：
- 在 `design` 和 `tasks` 中注入**完全相同**的规则
- 这会导致冗余，且没有考虑两个阶段的职责差异
- 没有理解 OpenSpec 工作流中 artifacts 的依赖关系

## 最终修正方案

**正确理解**：基于 OpenSpec 工作流的依赖关系

### OpenSpec 工作流的关键发现

1. **tasks 生成时的依赖**（spec-driven schema）：
   ```yaml
   tasks:
     requires:
       - specs
       - design  # ← tasks 生成时会读取 design.md
   ```

2. **apply 阶段的上下文文件**：
   - 虽然官方定义是 `apply.requires: [tasks]`
   - 但实际会读取所有 context files：proposal, specs, design, tasks
   - 因此 apply 阶段也会读取 design.md

3. **tasks.md 的生成逻辑**：
   ```yaml
   instruction: |
     Reference specs for what needs to be built, design for how to build it.
   ```
   - tasks.md 应该**引用** design.md，而不是重复所有细节

### 最终方案：只在 design 中注入

**修正方案**：
- 将全局 CLI UX 规范**只**放在 `rules.design` 中
- 不在 `rules.tasks` 中重复注入

**理由**：

1. **生成 design.md 时**：
   - `rules.design` 注入全局规范
   - design.md 会包含这些规范的详细说明

2. **生成 tasks.md 时**：
   - AI Agent 会读取 design.md（因为 `tasks.requires: [design]`）
   - tasks.md 只需要引用 design.md 中的规范
   - 例如："实现错误处理时遵循 design.md 中的标准错误码规范"

3. **apply 阶段时**：
   - AI Agent 会读取 design.md 和 tasks.md
   - 从 design.md 中获取全局规范的详细信息
   - 从 tasks.md 中获取具体的实施步骤

## 对比总结

| 方案 | `rules.specs` | `rules.design` | `rules.tasks` | 结果 |
|------|---------------|----------------|---------------|------|
| 原始 | 包含全局规范 | - | - | ❌ 每个 spec 重复添加系统行为需求 |
| 第一次修正 | - | 包含全局规范 | 包含全局规范 | ⚠️ 冗余，未考虑依赖关系 |
| 最终方案 | - | 包含全局规范 | - | ✅ 避免冗余，利用依赖关系 |

## 总结

感谢用户的两次敏锐发现：
1. 第一次发现：`rules.specs` 的误用会导致 spec 文件重复
2. 第二次发现：`rules.design` + `rules.tasks` 的重复注入是冗余的

这次修正确保了：
- ✅ 全局规范只定义一次（在 `rules.design` 中）
- ✅ 利用 OpenSpec 工作流的依赖关系，避免重复注入
- ✅ tasks 生成和 apply 阶段都会读取 design.md，确保规范被遵循
- ✅ 符合 OpenSpec 的设计哲学：fluid, iterative, easy
