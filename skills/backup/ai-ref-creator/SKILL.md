---
name: ai-ref-creator
description: > 
  Converts lengthy official product documentation into concise, high-density AI references. Use when users request: (1) Documentation compression or condensing, (2) Creating AI-friendly reference materials, (3) Reducing token usage for large documentation, (4) Extracting technical specifications from official docs
---

# AI 参考文档创建器

将冗长的官方产品文档压缩、提炼为简洁、高密度的 AI 友好参考文档。

## 核心策略

采用"提炼与重构"方法，而非摘要总结。

**关键原则：源文件可追溯性**
- 始终保留 `<!-- Source: path/to/file.md -->` 引用
- 分包脚本会自动生成这些标记（相对于项目根目录的路径）
- 在压缩输出中保留这些标记，以便 Agent 定位原始文档

**压缩(提炼)规则：**
参见 [references/compression_rules.md](references/compression_rules.md) 获取完整规则，包括：
- 保留内容（API 签名、参数、配置、约束、重要参考链接）
- 删除内容（营销文案、教程、重复示例）
- 格式偏好（表格、TypeScript 接口、嵌套列表）
- 前后对比示例和边界情况

**何时阅读 compression_rules.md：**
- 开始压缩提炼之前（获取方法概览）
- 处理边界情况或不确定格式时
- 需要给 Sub Agents 构建提示词时

## 工作流程

### 阶段 1：发现

1. **智能发现**：
   - 识别目标文档目录（如 `docs/link_references/opencode/`）
   - **确定产品名称**：不要假设文件夹名称就是产品名称。阅读 `index.md` 或第一个可用文件以找到实际产品标题（如"OpenCode"而非"opencode_docs"）
   - **确定输出目录**：`docs/ai-references/<ProductName>/`

### 阶段 2：原始文档分块

**始终运行脚本对原始文档进行分块**：

```bash
python scripts/bundle_docs.py \
  -i <input_docs_dir> \
  -o <output_dir> \
  --max-size 40
```

**脚本功能：**
- 按标题分割大文件，合并小文件
- 在输出目录下创建 `.bundles_temp/`，包含：
  - 打包分块文件（`*_partNN.md`）
  - `manifest.json` 元数据（源路径、文件计数、大小）

### 阶段 3：处理打包文件

**阅读 manifest.json 以了解结构：**

```json
{
  "bundle_file": "_root_part01.md",
  "name": "_root_part01",
  "file_count": 3,
  "total_size_kb": 25.5,
  "source_files": [
    "docs/link_references/opencode/cli.md",
    "docs/link_references/opencode/config.md",
    "docs/link_references/opencode/api.md"
  ]
}
```

**处理策略：**

**小文档（<3 个分块文件）：**
- Main Agent 顺序处理
- 读取每个分块文件，应用压缩提炼规则
- Main Agent 构建单个缓冲区, 

**大文档（≥3 个打包文件）：**
- 为每个分块文件创建一个 Sub Agent
- 每个 Sub Agent 将压缩后的 markdown 写入磁盘（不返回内容）
- Main Agent 仅负责协调

**Sub Agent 指令（使用并行处理时）：**

```text
你是一个参考文档压缩器，擅长将官方文档或者教程压缩、提炼成 AI agent 友好的精简的快速参考文档。

任务：读取 <bundle_path> 处的文档并压缩提炼它。

关键约束：
- 将压缩提炼后的 markdown 写入磁盘：<output_path>
- 不要在响应中返回压缩后的内容
- 仅返回简短的状态消息："Compressed to: <output_path>"

压缩提炼规则：
1. 处理所有 <!-- Source: ... --> 标记的部分
2. **关键：保留所有 Source markers！**
    - 每个 `<!-- Source: path/to/file.md -->` 标记必须保留
    - 即使内容被压缩，Source markers 也必须留在对应内容之前
    - 删除 Source markers 会破坏到原始文档的可追溯性
3. 提取并保留：API 签名、参数、配置、约束、重要参考信息链接
4. 删除：营销文案、教程、重复示例
5. 格式：参数使用表格、TypeScript 风格接口、嵌套列表
6. 保持提炼后的内容高度精简，极具技术参考价值

如遇到复杂文档，需详细规则、示例和边界情况，阅读 references/compression_rules.md。
```

### 阶段 4：合成与输出

**自动化工作流程：**

**合并打包脚本：**

```bash
python scripts/merge_refs.py \
  -d <compressed_dir> \
  -o <output_file> \
  --max-size 40
```

**何时使用自动化合并：**
- 大型文档始终使用（≥3 个打包文件）
- 建议所有情况都使用以保持一致性
- 如需调试使用 `--keep-temp` 标志

--- 

## 资源

此技能包含以下捆绑资源：

### references/compression_rules.md

详细的压缩规则、黄金原则和前后对比示例。在处理文档时阅读此文件以确保一致、高质量的输出。

### scripts/bundle_docs.py

智能文档分块脚本。按标题分割大文件并合并小文件以进行高效处理。

**用法：**
```bash
python scripts/bundle_docs.py -i ./docs -o ./bundles --max-size 40
```

**参数：**
- `-i, --input`：包含 Markdown 文件的输入目录
- `-o, --output`：打包文件的输出目录
- `--max-size`：最大打包文件大小（单位 KB，默认 40）

**输出结构：**
```
<output_dir>/
├── .bundles_temp/          # 临时目录（自动创建）
│   ├── *_partNN.md         # 打包文件
│   └── manifest.json       # 打包元数据
└── (压缩后在此处写入最终输出文件)
```

### scripts/merge_refs.py

压缩打包文件的自动化合并脚本。处理验证、token 估算和输出生成。

**何时使用：** 在 Sub Agent 将所有打包文件压缩到磁盘后（在 `.bundles_temp/compressed/` 中）。

**用法：**
```bash
python scripts/merge_refs.py \
  -d <compressed_dir> \
  -o docs/ai-references/Product/reference.md \
  --max-size 40
```

**参数：**
- `-d, --bundles-dir`：包含 `.bundles_temp` 文件夹的目录
- `-o, --output`：最终参考文档的输出文件路径
- `--max-size`：每个输出文件的最大大小（单位：k，即 tokens/1000，默认 40）
- `--keep-temp`：保留临时目录用于调试

**功能：**
1. 验证所有压缩后的打包文件（Source markers、格式）
2. 估算总 token 数量
3. 自动决策：单文件还是分割为多个文件
4. 添加 AI Reference header
5. 合并所有压缩内容并保留 Source markers
6. 生成验证报告
7. 清理临时文件

**输出：**
- 最终参考文件：`reference.md` 或 `reference_01.md`, `reference_02.md` 等
- 验证报告：`reference_verification_report.txt`

## 完整流程示例

**任务**：将 OpenCode 官方文档压缩为 AI 参考文档

**步骤**：
1. 发现：识别 `docs/link_references/opencode/官方文档/` 和产品名称 "OpenCode"
2. 文档分块：`python scripts/bundle_docs.py -i docs/link_references/opencode/官方文档 -o docs/ai-references/OpenCode --max-size 40`
3. 压缩提炼：使用 7 个Sub Agent 将打包文件压缩到 `.bundles_temp/compressed/`
4. 合并提炼结果：`python scripts/merge_refs.py -d docs/ai-references/OpenCode -o docs/ai-references/OpenCode/reference.md --max-size 40`
5. 清理：在处理完所有模块后删除 `.bundles_temp/`。

**结果**：`docs/ai-references/OpenCode/reference.md`（61KB），保留 33 个 Source markers

