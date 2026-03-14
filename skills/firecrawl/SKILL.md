---
name: firecrawl
description: 本地部署的 Firecrawl 网页提取和爬取工具。使用此技能当需要：(1) 从单个或多个 URL 提取结构化数据，(2) 爬取整个网站并保存为 Markdown/HTML，(3) 提取 Twitter/X 推文内容（100% 成功率），(4) 使用 LLM 智能提取网页信息，(5) 批量处理多个网页。支持自定义 JSON Schema、路径过滤、深度控制。本地部署于 localhost:3002，配置 DashScope API (MiniMax-M2.5 模型)。
---

# Firecrawl 本地部署技能

Firecrawl 是一个强大的网页提取和爬取工具，通过 LLM 智能提取结构化数据。本技能封装了本地部署的 Firecrawl 实例。

## 前置要求

### 依赖安装

脚本依赖 `requests` 库，首次使用前需安装：

```bash
uv pip install -r scripts/requirements.txt
```

### 服务要求

- Firecrawl 服务运行在 `http://localhost:3002`
- 环境配置文件位于 `/Users/sam/coding/good/firecrawl/.env`

## 快速开始

### 1. 检查服务状态

使用前先验证服务是否正常运行：

```bash
python scripts/check_status.py
```

### 2. 提取单个页面

最简单的用法：

```bash
python scripts/extract.py <URL>
```

### 3. 爬取整个网站

```bash
python scripts/crawl.py <URL> --output result.json
```

**注意**: v2 API 是异步的，脚本会自动轮询直到完成。

---

## 核心功能

### 提取 (Extract)

从单个或多个 URL 智能提取结构化数据。

**特点**：
- ✅ Twitter/X 推文提取（100% 成功率）
- ✅ GitHub 项目信息提取
- ✅ 自定义 JSON Schema
- ✅ 自定义提示词
- ✅ 批量处理

**使用场景**：
- 提取社交媒体内容
- 收集产品信息
- 提取 API 端点文档
- 批量处理网页数据

**详细用法**：见 [API_REFERENCE.md](references/API_REFERENCE.md#提取-api-extract) 和 [EXAMPLES.md](references/EXAMPLES.md#提取示例)

### 爬取 (Crawl)

爬取整个网站并保存结构化内容。

**特点**：
- ✅ 异步操作（v2 API）
- ✅ 自动轮询直到完成
- ✅ 多种输出格式（Markdown/HTML）
- ✅ 自动去重
- ⚠️ 某些参数（maxDepth, limit, includePaths）在 v2 API 中可能不被支持

**使用场景**：
- 收集技术文档
- 归档网站内容
- 批量下载页面
- 构建知识库

**详细用法**：见 [API_REFERENCE.md](references/API_REFERENCE.md#爬取-api-crawl) 和 [EXAMPLES.md](references/EXAMPLES.md#爬取示例)

---

## 脚本工具

| 脚本 | 功能 | 用途 |
|------|------|------|
| `check_status.py` | 检查服务状态 | 验证服务健康和配置 |
| `extract.py` | 提取数据 | 从 URL 提取结构化数据 |
| `crawl.py` | 爬取网站 | 批量爬取整个网站 |

所有脚本支持 `--help` 查看详细参数。

---

## 工作流指南

### 标准提取流程

1. **检查服务**: `python scripts/check_status.py`
2. **简单测试**: 不带 schema 提取，查看自动提取结果
3. **定义 Schema**: 根据需求创建 JSON Schema
4. **执行提取**: 使用 `--schema` 和 `--prompt` 精确控制
5. **保存结果**: 使用 `--output` 保存到文件

### 标准爬取流程

1. **检查服务**: `python scripts/check_status.py`
2. **小规模测试**: 设置小的 limit（如 10）测试
3. **配置参数**: 调整 maxDepth、includePaths、excludePaths
4. **执行爬取**: 运行爬取命令
5. **处理结果**: 分析输出 JSON，提取需要的内容

---

## 重要配置说明

### 环境配置

本实例使用 DashScope API 配置：

```bash
OPENAI_BASE_URL=https://coding.dashscope.aliyuncs.com/v1
OPENAI_API_KEY=sk-sp-xxxxx
MODEL_NAME=MiniMax-M2.5
SEARXNG_ENDPOINT=http://searxng:8080
```

**关键限制**：
- `structuredOutputs: false` - MiniMax-M2.5 不支持 `json_schema` 模式，使用 `json_object` 模式
- API 地址: `http://localhost:3002`

### 已知限制

1. **反爬虫保护**: 部分网站（如 clawhub.ai）可能阻止爬取
2. **速率限制**: 建议控制请求频率
3. **超时**: 默认 60-300 秒超时

**替代方案**: 对于被阻止的网站，可使用 Tavily 工具作为备选。

---

## 完整示例

### 示例 1: 提取 GitHub 项目信息

```bash
# 定义 Schema
cat > github-schema.json << 'EOF'
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "description": { "type": "string" },
    "stars": { "type": "number" },
    "language": { "type": "string" }
  }
}
EOF

# 执行提取
python scripts/extract.py https://github.com/mendableai/firecrawl \
  --schema github-schema.json \
  --output result.json \
  --pretty
```

### 示例 2: 爬取文档站点

```bash
# 爬取文档站点（异步操作）
python scripts/crawl.py https://docs.openrouter.ai/docs \
  --output docs.json \
  --pretty
```

**注意**: v2 API 是异步的，脚本会显示进度并自动等待完成。

### 示例 3: 批量提取推文

```bash
# 批量处理多个推文
python scripts/extract.py \
  https://x.com/user/status/123 \
  https://x.com/user/status/456 \
  https://x.com/user/status/789 \
  --prompt "提取推文内容、作者和发布时间" \
  --output tweets.json
```

更多示例见 [EXAMPLES.md](references/EXAMPLES.md)。

---

## 性能对比

| 场景 | Firecrawl | 备注 |
|------|-----------|------|
| Twitter/X | ✅ 100% | 完美支持 |
| GitHub | ✅ 优秀 | 完整内容 |
| 文档站点 | ✅ 优秀 | 结构化输出 |
| 反爬虫网站 | ⚠️ 受限 | 部分被阻止 |
| 成本 | ✅ 免费 | 本地部署 |

---

## 故障排查

### 服务无法连接

```bash
# 检查服务状态
python scripts/check_status.py

# 确认 Docker 容器运行
docker ps | grep firecrawl
```

### 提取失败

1. 检查 URL 格式是否正确
2. 尝试不带 schema 的简单提取
3. 查看服务日志：`docker logs firecrawl-api`
4. 对于被阻止的网站，使用 Tavily 备选

### 爬取结果不完整

1. 增加 `maxDepth` 参数
2. 检查 `includePaths` 和 `excludePaths` 设置
3. 增加 `limit` 限制
4. 检查目标网站的 robots.txt

---

## 相关资源

- **API 文档**: [API_REFERENCE.md](references/API_REFERENCE.md)
- **使用示例**: [EXAMPLES.md](references/EXAMPLES.md)
- **源代码**: `/Users/sam/coding/good/firecrawl`
- **环境配置**: `/Users/sam/coding/good/firecrawl/.env`

---

## 最佳实践总结

1. ✅ 使用前检查服务状态
2. ✅ 小规模测试后再扩大范围
3. ✅ 使用路径过滤提高效率
4. ✅ 保存结果到文件
5. ✅ 合理设置深度和限制
6. ✅ 对 Twitter 优先使用 Firecrawl
7. ✅ 反爬虫网站考虑 Tavily 备选
