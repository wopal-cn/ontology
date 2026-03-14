# Firecrawl 使用示例

## 快速开始

### 1. 检查服务状态

```bash
python scripts/check_status.py
```

输出示例:
```
==================================================
Firecrawl 状态检查
==================================================

服务状态: HEALTHY
✓ API 地址: http://localhost:3002
✓ 响应码: 200

配置文件: ✓ 存在
已配置的环境变量:
  - OPENAI_BASE_URL: configured
  - OPENAI_API_KEY: ***
  - MODEL_NAME: configured
  - SEARXNG_ENDPOINT: configured
==================================================
```

---

## 提取示例

### 2. 提取单个页面（无 Schema）

最简单的用法，自动提取关键信息：

```bash
python scripts/extract.py https://github.com/mendableai/firecrawl
```

### 3. 提取单个页面（带 Schema）

定义精确的数据结构：

```bash
# 创建 schema.json
cat > schema.json << 'EOF'
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

python scripts/extract.py https://github.com/mendableai/firecrawl \
  --schema schema.json \
  --pretty
```

### 4. 提取 Twitter/X 推文

Firecrawl 对 Twitter 支持优秀（100% 成功率）：

```bash
python scripts/extract.py https://x.com/ctatedev/status/2028960626685386994 \
  --prompt "提取推文内容、作者和时间"
```

输出示例:
```json
{
  "success": true,
  "data": {
    "content": "Just launched our new AI feature!",
    "author": "ctatedev",
    "timestamp": "2024-01-15"
  }
}
```

### 5. 批量提取多个页面

一次提取多个 URL：

```bash
python scripts/extract.py \
  https://docs.bigmodel.cn/docs/intro \
  https://docs.bigmodel.cn/docs/quickstart \
  --output results.json \
  --pretty
```

### 6. 使用自定义提示词

指导 LLM 提取特定信息：

```bash
python scripts/extract.py https://example.com \
  --prompt "提取所有联系信息，包括邮箱、电话和地址"
```

---

## 爬取示例

**重要**: v2 API 是异步的。`crawl.py` 脚本会自动轮询任务状态直到完成。

### 7. 爬取文档站点（基础）

```bash
python scripts/crawl.py https://example.com --output docs.json --pretty
```

输出示例:
```
🚀 启动爬取任务: https://example.com
📋 任务 ID: 019cb95b-806f-70ba-866f-1b9fd4d43ab7
⏳ 爬取进行中... 已完成 5/20 页
✓ 爬取完成！共 20 页
✓ 爬取完成，结果已保存到 docs.json
```

### 8. 爬取并保存为多种格式

```bash
python scripts/crawl.py https://example.com \
  --formats markdown html \
  --output site-data.json
```

**注意**: 以下参数在 v2 API 中可能不被支持：
- `--max-depth`: 最大爬取深度
- `--max-breadth`: 每层最大链接数
- `--limit`: 总页面限制
- `--include-paths`: 包含的路径正则模式
- `--exclude-paths`: 排除的路径正则模式

---

## 实际场景示例

### 场景 1: 技术文档收集

收集某个项目的完整文档：

```bash
# 爬取主文档
python scripts/crawl.py https://project.com/docs \
  --output project-docs.json

# 提取特定页面的代码示例
python scripts/extract.py https://project.com/docs/examples \
  --prompt "提取所有代码示例及其说明" \
  --output examples.json
```

### 场景 2: 社交媒体监控

监控特定账号的推文：

```bash
# 批量提取推文
python scripts/extract.py \
  https://x.com/user/status/123 \
  https://x.com/user/status/456 \
  https://x.com/user/status/789 \
  --prompt "提取推文内容、互动数据（转发、点赞、评论）" \
  --output tweets.json
```

### 场景 3: 竞品分析

分析竞品网站：

```bash
# 爬取竞品网站
python scripts/crawl.py https://competitor.com \
  --output competitor-site.json

# 提取产品特性
python scripts/extract.py https://competitor.com/features \
  --schema feature-schema.json \
  --output features.json
```

### 场景 4: API 文档提取

提取 API 文档中的端点信息：

```bash
# 创建 API schema
cat > api-schema.json << 'EOF'
{
  "type": "object",
  "properties": {
    "endpoints": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "method": { "type": "string" },
          "description": { "type": "string" }
        }
      }
    }
  }
}
EOF

python scripts/extract.py https://api.example.com/docs \
  --schema api-schema.json \
  --output api-endpoints.json
```

---

## 常见问题

### Q: 如何处理反爬虫保护？

A: Firecrawl 对部分网站可能被阻止。建议：
1. 对于无法访问的网站，考虑使用 Tavily 作为备选

### Q: 爬取任务需要多长时间？

A: v2 API 是异步的，时间取决于网站大小：
1. 小型网站（<10页）：通常 10-30 秒
2. 中型网站（10-50页）：通常 30-120 秒
3. 大型网站（>50页）：可能需要几分钟
4. `crawl.py` 脚本会自动轮询直到完成，默认最长等待 300 秒

### Q: 如何优化爬取性能？

A: 
1. 使用适当的输出格式（markdown 通常最快）
2. 如果爬取超时，可以手动使用 API 分批爬取

### Q: Twitter 提取失败怎么办？

A: Firecrawl 对 Twitter 支持优秀，如遇失败：
1. 检查 URL 格式是否正确
2. 确认服务状态正常
3. 尝试使用 `--prompt` 指定提取内容

### Q: 如何调试提取结果？

A: 
1. 使用 `--pretty` 美化输出
2. 先不带 schema 测试，查看自动提取结果
3. 检查服务日志

---

## 最佳实践

1. **先检查服务状态**: 使用 `check_status.py` 确保服务正常
2. **小规模测试**: 先用小数据集测试，确认配置正确
3. **合理设置限制**: 避免设置过大的 depth 和 limit
4. **保存结果**: 始终使用 `--output` 保存结果
5. **使用路径过滤**: 提高爬取效率，减少不必要的内容
