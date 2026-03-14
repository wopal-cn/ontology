# Firecrawl API 参考文档

## API 端点

### 基础 URL

```
http://localhost:3002
```

### 版本

- v1: 基础 API
- v2: 推荐 API（完整功能）

---

## 提取 API (Extract)

### 单页面提取

**端点**: `POST /v1/extract`

**请求体**:
```json
{
  "urls": ["https://example.com"],
  "schema": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "description": { "type": "string" }
    }
  },
  "prompt": "提取页面标题和描述"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "title": "Example Domain",
    "description": "This domain is for use in illustrative examples..."
  }
}
```

**参数**:
- `urls` (required): URL 数组（支持单个或多个）
- `schema` (optional): JSON Schema 定义数据结构
- `prompt` (optional): 自定义提取提示词

**特点**:
- 使用 LLM 智能提取结构化数据
- 支持 Twitter/X 链接（成功率 100%）
- 支持自定义 JSON Schema
- 无需预先定义格式

---

## 爬取 API (Crawl)

### v2 爬取（异步，推荐）

**端点**: `POST /v2/crawl`

**重要**: v2 API 是**异步**的，创建任务后需要轮询获取结果。

**步骤 1: 创建爬取任务**

**请求体**:
```json
{
  "url": "https://docs.example.com",
  "scrapeOptions": {
    "formats": ["markdown"]
  }
}
```

**响应**:
```json
{
  "success": true,
  "id": "019cb95b-806f-70ba-866f-1b9fd4d43ab7",
  "url": "http://localhost:3002/v2/crawl/019cb95b-806f-70ba-866f-1b9fd4d43ab7"
}
```

**步骤 2: 轮询任务状态**

**端点**: `GET /v2/crawl/{job_id}`

**响应** (进行中):
```json
{
  "success": true,
  "status": "scraping",
  "completed": 5,
  "total": 20
}
```

**响应** (完成):
```json
{
  "success": true,
  "status": "completed",
  "completed": 20,
  "total": 20,
  "data": [
    {
      "markdown": "# Title\n\nContent...",
      "metadata": {
        "title": "Page Title",
        "url": "https://docs.example.com/page1"
      }
    }
  ]
}
```

**参数**:
- `url` (required): 起始 URL
- `scrapeOptions` (optional): 爬取选项
  - `formats`: 输出格式数组（markdown, html, rawHtml, links, screenshot）

**注意**: 以下参数在 v2 API 中可能不被支持或行为不同：
- `maxDepth`: 最大深度
- `maxBreadth`: 每层最大链接数
- `limit`: 总页面限制
- `includePaths`: 包含的路径正则模式
- `excludePaths`: 排除的路径正则模式

**特点**:
- 异步操作，适合大规模爬取
- 自动轮询直到完成（脚本已封装）
- 支持长时间运行的任务
- 自动去重

---

## 健康检查

**端点**: `GET /health`

**响应**:
```
OK
```

**用途**: 验证服务是否运行

---

## 配置要求

### 环境变量

```bash
# LLM 配置（DashScope API）
OPENAI_BASE_URL=https://coding.dashscope.aliyuncs.com/v1
OPENAI_API_KEY=sk-sp-xxxxx
MODEL_NAME=MiniMax-M2.5

# 搜索引擎
SEARXNG_ENDPOINT=http://searxng:8080
```

### 重要说明

1. **structuredOutputs**: 本部署配置为 `false`，使用 `json_object` 模式而非 `json_schema` 模式（MiniMax-M2.5 不支持）
2. **模型**: 使用 MiniMax-M2.5（DashScope API）
3. **本地部署**: 运行在 localhost:3002

---

## 限制与已知问题

### 限制

1. **反爬虫保护**: 部分网站（如 clawhub.ai）可能阻止爬取
2. **速率限制**: 建议控制请求频率
3. **超时**: 默认 60-300 秒超时

### 已知问题

1. **v1 API**: 功能有限，推荐使用 v2
2. **复杂网站**: 可能需要调整 maxDepth 和 limit 参数

---

## 性能特点

| 场景 | Firecrawl | 备注 |
|------|-----------|------|
| Twitter/X | ✅ 100% | 完美支持 |
| GitHub | ✅ 优秀 | 完整内容 |
| 文档站点 | ✅ 优秀 | 结构化输出 |
| 反爬虫网站 | ⚠️ 受限 | 部分被阻止 |
| 成本 | ✅ 免费 | 本地部署 |

---

## 最佳实践

1. **优先使用 v2 API**: 功能更完整
2. **合理设置深度**: maxDepth 2-3 通常足够
3. **使用路径过滤**: 通过 includePaths/excludePaths 提高效率
4. **批量提取**: 使用 extract 批量处理多个 URL
5. **监控服务**: 定期检查 /health 端点
