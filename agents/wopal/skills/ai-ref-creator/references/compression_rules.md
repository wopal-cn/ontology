# AI 参考文档压缩规则

## 黄金原则

### 高密度
每一行都必须包含可操作的技术信息。无填充内容、无营销文案、无废话。

### 签名优先
优先考虑 API 签名、方法签名和配置结构。这些是 AI 回答技术问题所需的内容。

### 无营销废话
删除所有促销语言、推荐内容、无技术细节的功能亮点和销售导向内容。

### 结构优于叙述
使用表格、列表和代码块而非描述性段落。

### 源文件可追溯性（关键）
**最高优先级：保留所有 Source markers！**
- **每个** `<!-- Source: path/to/file.md -->` 标记必须保留
- 即使标记下的内容被删除，标记本身必须保留
- 这是追溯回原始文档的唯一链接
- 压缩后缺失 Source markers = 失败
- 始终将 Source markers 放在对应内容的开头

## 内容策略

### 保留内容（高优先级）

1. **参考信息**
   - 保留原始文档中的重要参考信息
   - 精简为简要描述
   - 保留标准格式的 markdown 外部链接 

2. **API 签名**
   - 函数/方法名称
   - 参数类型
   - 返回类型
   - 默认值

3. **配置选项**
   - 选项名称
   - 有效值
   - 默认值
   - 约束/要求
   - 选项之间的依赖关系

4. **技术约束**
   - 速率限制
   - 配额
   - 最大/最小值
   - 必备先决条件
   - 版本要求

5. **架构信息**
   - 组件关系
   - 数据流
   - 状态管理
   - 扩展点
   - 架构图(保留外部链接或者转换为 mermaind 图)

6. **错误条件**
   - 错误代码
   - 错误消息
   - 原因
   - 解决方案

### 删除内容

1. **营销内容**
   - 功能优势
   - 商业用例
   - 比较优势
   - 推荐内容

2. **教程内容**
   - 入门指南
   - 逐步演练
   - "Hello World" 示例
   - 截图密集型教程

3. **重复示例**
   - 多个相似的代码示例
   - 对明显行为的冗长解释
   - 跨部分重复的概念

4. **非技术上下文**
   - 产品历史
   - 团队简介
   - 未来路线图
   - 理念陈述
   - 优化说明

## 格式指南

### 在章节开头放置源文件引用

**必需格式：**
```markdown
## API 端点

<!-- Source: docs/link_references/api/endpoints.md -->

### POST /users
创建新用户。
```

**注意：**
- 所有路径都是相对于项目根目录
- 分包脚本自动检测项目根目录并生成这些标记
- 不要修改路径本身

**对于打包内容（多个源文件）：**
```markdown
## 认证

<!-- Source: docs/link_references/auth/login.md -->
<!-- Source: docs/link_references/auth/oauth.md -->
```

### 参数和选项使用表格

**首选：**
```markdown
| 参数    | 类型   | 必需 | 默认值 | 描述                 |
| ------- | ------ | ---- | ------ | -------------------- |
| timeout | number | 否   | 5000   | 连接超时时间（毫秒） |
| retries | number | 否   | 3      | 重试次数             |
```

**避免：**
```markdown
timeout 参数允许您指定在超时前等待多长时间。它接受数字值，默认为 5000，是可选的。
```

### TypeScript 风格接口定义

即使对于 Python/Java，也使用 TypeScript 风格的接口以清晰表示：

```typescript
interface Config {
  timeout?: number;        // 连接超时（毫秒），默认：5000
  retries?: number;        // 重试次数，默认：3
  headers?: Record<string, string>;  // HTTP headers
  auth?: {
    apiKey: string;        // 必需的 API key
    method: 'basic' | 'bearer';
  };
}
```

### 层级结构使用嵌套列表

```markdown
- 认证
  - API Key
    - Header: `X-API-Key`
    - 位置：Request header
  - OAuth 2.0
    - 范围：`read`、`write`、`admin`
    - Token 端点：`/oauth/token`
```

### 多个项目使用要点

**首选：**
```markdown
支持的文件格式：
- 配置文件：JSON、YAML、XML
- 图片：PNG、JPG、SVG
- 文档：PDF、DOCX
```

**避免：**
```markdown
系统支持多种文件格式。对于配置文件，可以使用 JSON、YAML 或 XML。对于图片，支持 PNG、JPG 和 SVG。对于文档，PDF 和 DOCX 格式都适用。
```

## 压缩(提炼)前后对比示例

### 示例：API 文档

**压缩前（原文）：**
```markdown
# 使用我们的 API 入门

欢迎使用我们强大的 API！这个强大的工具让您只需几行代码就能将我们的服务集成到您的应用程序中...

## 认证

要使用 API，您需要一个 API key。您可以从我们的控制台获取...

## 端点

### 创建用户

此端点允许您在系统中创建新用户...

## 速率限制

我们有慷慨的速率限制以确保公平使用...
```

**压缩(提炼)后：**
```markdown
# API 参考

<!-- Source: docs/api/authentication.md -->

## 认证
- 方法：Bearer Token
- Header: `Authorization: Bearer <api-key>`

<!-- Source: docs/api/users.md -->

## 端点

### POST /users
**请求：** `{ name: string; email: string; }`

**响应：** `{ id: number; name: string; email: string; createdAt: string; }`

## 速率限制

| 级别   | 每分钟请求数 |
| ------ | ------------ |
| 免费   | 100          |
| 专业版 | 1,000        |
```

---

## 关键警告：源文件可追溯性

**处理任何文档时，严格遵循以下规则：**

1. **处理每个打包文件后必须保留所有 Source markers**
   - 即使内容被完全删除，Source markers 也必须保留
   - Source marker 格式：`<!-- Source: path/to/file.md -->`
   - 必须放在对应内容的开头

2. **合并过程中的验证步骤**
   - 检查每个主要部分是否有对应的 Source markers
   - 如果任何打包文件输出缺少 Source markers，请求重新处理
   - 最终文档的 Source marker 数量应 ≥ 打包文件数量

3. **Source markers 的重要性**
   - 这是 AI Agent 追溯回原始文档的唯一方法
   - 缺失 Source markers 会使文档无法维护
   - 违反此规则视为处理失败

**示例检查清单：**
- [ ] 每个主要部分都有 `<!-- Source: ... -->` 标记
- [ ] 所有标记路径都是相对于项目根目录
- [ ] 没有遗漏任何原始文档引用
- [ ] 标记位置正确（在对应内容之前）
- [ ] 重要参考信息外部链接正确保留
