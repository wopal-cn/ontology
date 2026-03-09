## Context

### 背景

当前 `openspec/specs/` 下存在 6 个主规格，其中 `wopal-cli-cli-ux-guidelines` (189 行) 定义了全局 CLI UX 规范。然而，多个命令能力规格（如 `wopal-cli-skills-download`、`wopal-cli-skills-scan`）又重复定义了相同的规范片段。

**当前状态**：
- 全局 UX 规范分散在多个规格中
- 维护成本为 O(N)，N = 命令能力数量
- 容易出现不一致（某个规格更新了规范，其他规格未同步）

### 约束

- **OpenSpec 兼容性**: 必须与当前 OpenSpec 规范工作流 100% 兼容
- **向后兼容**: 不能破坏现有规格的行为契约
- **设计哲学**: 遵循 OpenSpec 的设计哲学（fluid, iterative, easy, brownfield-first）

### 利益相关者

- **AI Agent**: 生成规格时需要遵循统一的全局规范
- **开发者**: 实现规格时需要理解全局约束
- **维护者**: 需要维护全局规范的一致性

## Goals / Non-Goals

**Goals:**

- 将全局 CLI UX 规范集中到 `config.yaml` 的 `rules.specs` 字段
- 删除冗余的 `wopal-cli-cli-ux-guidelines` 规格
- 清理所有命令能力规格中的重复定义
- 降低维护成本从 O(N) 到 O(1)
- 确保所有后续生成的规格自动遵循全局规范

**Non-Goals:**

- 不修改规格的行为契约（只清理重复定义）
- 不引入新的规格继承或引用机制
- 不修改 OpenSpec 核心代码
- 不影响现有命令的实现代码

## Decisions

### 决策 1：使用 config.yaml 的 rules.specs 机制

**选择**: 利用 OpenSpec 原生的 `config.yaml` → `rules.specs` 注入机制

**理由**:
- **原生支持**: OpenSpec 已内置此机制，无需修改工具
- **自动注入**: `rules.specs` 会自动注入到所有规格生成指令中
- **符合哲学**: 利用现有机制，符合 "easy not complex" 原则
- **可验证**: 已通过源码分析验证注入机制（instruction-loader.ts:200-204）

**替代方案**:
1. **约定式引用**: 在规格 Purpose 部分声明依赖 → 依赖关系是文本约定，工具无法自动验证
2. **元数据块引用**: 在规格开头添加 YAML frontmatter → 需要修改 parser 和 schema，违背 "easy not complex"
3. **抽象规格机制**: 引入 abstracts/ 目录，支持规格继承 → 需要大幅重构，违背扁平化设计

**权衡**: 选择方案 D（config.yaml）牺牲了规格的自包含性（全局规范不在规格文件内），换取了维护成本和一致性。

### 决策 2：删除 wopal-cli-cli-ux-guidelines 规格

**选择**: 完全删除 `openspec/specs/wopal-cli-cli-ux-guidelines/` 目录

**理由**:
- 全局规范已移至 `config.yaml`，无需独立规格
- 避免维护两份重复的规范定义
- 符合 "single source of truth" 原则

**替代方案**:
1. **保留为参考文档**: 移至 `docs/` 目录 → 可能导致与 `config.yaml` 不一致
2. **保留为空壳规格**: 只包含指向 `config.yaml` 的引用 → 增加理解成本

### 决策 3：渐进式清理重复定义

**选择**: 先修改 `config.yaml`，验证注入效果后再清理规格文件

**理由**:
- **降低风险**: 先验证机制生效，再删除内容
- **可回滚**: 如果注入失败，可以快速回滚
- **增量验证**: 可以逐步验证每个规格的清理效果

**实施策略**:
1. Phase 1: 增强 `config.yaml`，添加全局 CLI UX 规范
2. Phase 2: 删除 `wopal-cli-cli-ux-guidelines` 目录
3. Phase 3: 清理所有命令能力规格中的重复定义
4. Phase 4: 验证 AI 生成规格时是否遵循 `config.yaml` 的 rules

## Risks / Trade-offs

### 风险 1：AI Agent 可能未遵循 config.yaml 的 rules

**风险**: 修改后，AI Agent 生成规格时可能未正确遵循 `config.yaml` 的 `rules.specs`

**缓解措施**:
- 在实施前使用 `/OPSX: Propose` 创建测试变更，验证注入效果
- 检查生成的规格是否包含全局规范约束
- 如果验证失败，考虑在 `context` 字段中添加显式说明

### 风险 2：规格自包含性降低

**风险**: 全局规范不在规格文件内，可能降低规格的自包含性和可读性

**缓解措施**:
- 在 `context` 字段中添加对全局规范的引用说明
- 在 OpenSpec 文档中明确说明 `config.yaml` 的作用
- 确保开发者理解全局规范的注入机制

### 风险 3：误删规格特有的需求

**风险**: 清理重复定义时，可能误删某个能力规格特有的 UX 需求

**缓解措施**:
- 仔细审查每个规格，只移除与全局规范完全重复的部分
- 保留能力特有的需求（如特定的错误码、特定的输出格式）
- 在清理前备份原规格文件

## Migration Plan

### 部署步骤

1. **准备工作**
   - 备份 `openspec/specs/wopal-cli-cli-ux-guidelines/spec.md`
   - 检查所有命令能力规格，识别重复定义

2. **Phase 1: 增强 config.yaml**
   - 从 `wopal-cli-cli-ux-guidelines/spec.md` 提取全局 CLI UX 规范
   - 将规范添加到 `openspec/config.yaml` 的 `rules.specs` 字段
   - 提交修改

3. **Phase 2: 验证注入效果**
   - 使用 `/OPSX: Propose` 创建测试变更
   - 检查生成的规格是否包含全局规范约束
   - 如果验证失败，回滚 Phase 1 并调整方案

4. **Phase 3: 删除冗余规格**
   - 删除 `openspec/specs/wopal-cli-cli-ux-guidelines/` 目录
   - 提交修改

5. **Phase 4: 清理重复定义**
   - 逐个清理命令能力规格中的重复定义
   - 只移除与全局规范完全重复的部分
   - 保留能力特有的需求
   - 每个规格清理后单独提交

6. **Phase 5: 最终验证**
   - 使用 `/OPSX: Propose` 创建测试变更
   - 验证 AI 生成规格时是否遵循 `config.yaml` 的 rules
   - 检查所有规格的一致性

### 回滚策略

- **Phase 1 回滚**: 恢复 `config.yaml` 的原始内容
- **Phase 3 回滚**: 从备份恢复 `wopal-cli-cli-ux-guidelines/` 目录
- **Phase 4 回滚**: 从 Git 历史恢复清理前的规格文件

## Open Questions

1. **是否需要在 `context` 字段中添加对全局规范的引用说明？**
   - 如果验证时发现 AI Agent 未正确遵循 `rules.specs`，需要考虑添加显式说明

2. **是否需要更新 OpenSpec 文档？**
   - 如果团队其他成员不熟悉 `config.yaml` 的 `rules` 机制，需要补充文档

3. **清理后的规格是否需要调整结构？**
   - 某些规格可能在清理重复定义后结构变得不完整，需要重新组织
