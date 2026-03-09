## Why

当前 `openspec/specs/` 下存在重复的全局性规范定义。`wopal-cli-cli-ux-guidelines` 规格定义了 CLI UX 规范（语言统一、帮助文档结构、错误提示格式等），但多个命令能力规格（如 `wopal-cli-skills-download`、`wopal-cli-skills-scan`）又重复定义了相同的规范。这种重复导致维护成本为 O(N)，N 为命令能力数量。

OpenSpec 提供了 `config.yaml` 的 `rules.specs` 机制，可以自动将全局规范注入到所有规格生成指令中。利用这个原生机制可以优雅地消除重复，提高可维护性。

## What Changes

- 将 `wopal-cli-cli-ux-guidelines/spec.md` 中的全局 CLI UX 规范提取到 `openspec/config.yaml` 的 `rules.specs` 字段
- **BREAKING**: 删除 `openspec/specs/wopal-cli-cli-ux-guidelines/` 目录
- 从所有命令能力规格中移除重复的 UX 规范定义（如"所有文本使用英文"、"命令帮助结构"等）
- 保留各能力规格特有的行为契约，只移除与全局规范重复的部分

## Capabilities

### New Capabilities

无。本次重构不引入新能力。

### Modified Capabilities

以下能力规格的 **实现细节** 将被清理（移除重复的全局规范定义），但 **行为契约本身不变**：

- `wopal-cli-skills-download`: 移除重复的"命令帮助"需求中关于语言和帮助结构的部分
- `wopal-cli-skills-scan`: 移除重复的"所有输出使用英文"需求

**注意**: 本次修改不涉及规格级别的行为变更，只是清理重复定义。全局规范将从 `config.yaml` 的 `rules.specs` 自动注入，不影响实际行为。

## Impact

### 直接影响

- **配置文件**: `openspec/config.yaml` - 在 `rules.specs` 中添加全局 CLI UX 规范
- **删除目录**: `openspec/specs/wopal-cli-cli-ux-guidelines/` - 不再需要独立规格
- **清理文件**: 
  - `openspec/specs/wopal-cli-skills-download/spec.md`
  - `openspec/specs/wopal-cli-skills-scan/spec.md`
  - 其他可能包含重复定义的命令能力规格

### 间接影响

- **OpenSpec 工作流**: 所有后续生成的规格将自动遵循 `config.yaml` 中的全局规范
- **维护成本**: 从 O(N) 降低到 O(1)，只需维护一处全局规范
- **一致性**: 确保所有规格遵循统一的全局规范，避免不一致

### 下游消费者

- AI Agent 生成规格时将自动遵循 `config.yaml` 的 `rules.specs`
- 开发者实现规格时将看到统一的全局规范约束
- 不影响现有的命令实现代码（规格行为契约不变）
