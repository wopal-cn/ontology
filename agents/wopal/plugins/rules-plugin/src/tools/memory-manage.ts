/**
 * memory_manage Tool - Memory CRUD Operations
 *
 * List, search, delete, add, and stats for LanceDB memories.
 * Registered as a plugin tool so it's always available regardless of install path.
 */

import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin";
import type { MemoryStore, MemoryCategory } from "../memory/store.js";
import type { EmbeddingClient } from "../memory/embedder.js";

const ECHO_REMINDER = [
  "",
  "重要：你必须将以上完整结果逐字展示给用户。用户无法看到工具内部输出，依赖你主动展示。",
  "每条记忆必须完整展示所有字段（ID、时间、分类、重要性、标签、正文），严禁省略、摘要或概括。",
].join("\n");

const CATEGORY_LABELS: Record<string, string> = {
  profile: "画像",
  preference: "偏好",
  knowledge: "知识",
  fact: "事实",
  gotcha: "避坑方法",
  experience: "经验",
  requirement: "用户要求",
};

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

function padTime(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${padTime(d.getMonth() + 1)}-${padTime(d.getDate())} ${padTime(d.getHours())}:${padTime(d.getMinutes())}:${padTime(d.getSeconds())}`;
}

export function createMemoryManageTool(store: MemoryStore, embedder?: EmbeddingClient): ToolDefinition {
  return tool({
    description:
      "管理 LanceDB 中的长期记忆。子命令: list（列出全部）, stats（统计）, search（搜索）, delete（删除）, add（添加单条）, update（更新单条）。 " +
      "list 支持 --category 和 --limit 过滤。delete 使用记忆 ID 前缀，多个用逗号分隔。" +
      "add 需要提供 text（记忆正文，至少 20 字符）和 category（分类）。" +
      "update 需要提供 id（记忆 ID 前缀），只传需要修改的字段，未传的字段保持不变。text 变更时会自动重新计算向量。",
    args: {
      command: tool.schema
        .enum(["list", "stats", "search", "delete", "add", "update"])
        .describe("子命令"),
      query: tool.schema
        .string()
        .optional()
        .describe("search 的查询内容 / delete 和 update 的 ID 前缀"),
      category: tool.schema
        .string()
        .optional()
        .describe("分类（profile/preference/knowledge/fact/gotcha/experience/requirement）。add 必填，update 可选"),
      limit: tool.schema
        .number()
        .optional()
        .describe("list 最大显示条数"),
      text: tool.schema
        .string()
        .optional()
        .describe("add/update 的记忆正文（add 至少 20 字符）"),
      importance: tool.schema
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("重要性（0-1，add 默认 0.5）"),
      project: tool.schema
        .string()
        .optional()
        .describe("所属项目（add 默认 wopal-space）"),
      concepts: tool.schema
        .string()
        .optional()
        .describe("语义标签（逗号分隔，如 'distill,蒸馏,规则'）"),
    },
    execute: async (args, context: ToolContext) => {
      const { command, query, category, limit, text, importance, project, concepts } = args;

      switch (command) {
        case "list":
          return (await formatList(store, category, limit)) + ECHO_REMINDER;
        case "stats":
          return (await formatStats(store)) + ECHO_REMINDER;
        case "search":
          return (await formatSearch(store, query ?? "")) + ECHO_REMINDER;
        case "delete":
          return (await deleteMemories(store, query ?? "")) + ECHO_REMINDER;
        case "add":
          return (await addMemory(store, embedder, text ?? "", category as MemoryCategory | undefined, {
            sessionId: context.sessionID ?? "unknown",
            importance: importance ?? 0.5,
            project: project ?? "wopal-space",
            concepts: concepts ? concepts.split(",").map(s => s.trim()).filter(Boolean) : [],
          })) + ECHO_REMINDER;
        case "update": {
          const updateOpts: UpdateOptions = {};
          if (text !== undefined) updateOpts.text = text;
          if (category !== undefined) updateOpts.category = category as MemoryCategory;
          if (importance !== undefined) updateOpts.importance = importance;
          if (project !== undefined) updateOpts.project = project;
          if (concepts !== undefined) updateOpts.concepts = concepts.split(",").map(s => s.trim()).filter(Boolean);
          return (await updateMemory(store, embedder, query ?? "", updateOpts)) + ECHO_REMINDER;
        }
        default:
          return `未知命令: ${command}`;
      }
    },
  });
}

async function formatList(
  store: MemoryStore,
  category?: string,
  limit?: number
): Promise<string> {
  const all = await store.searchByQuery("", 1000, "like", ["text"]);
  const sorted = all.sort((a, b) => b.created_at - a.created_at);

  const filtered = category
    ? sorted.filter((r) => r.category === category)
    : sorted;

  const displayed = filtered.slice(0, limit ?? 100);

  const lines: string[] = [
    `共 ${filtered.length} 条记忆${category ? ` (${getCategoryLabel(category)})` : ""}\n`,
  ];

  for (let i = 0; i < displayed.length; i++) {
    const r = displayed[i];
    const concepts = (r.metadata?.concepts as string[] | undefined)?.join(", ") ?? "(无)";
    lines.push(`${i + 1}. [${r.id.slice(0, 8)}] [${formatTime(r.created_at)}] [${getCategoryLabel(r.category)}] [重要性: ${r.importance}] [标签: ${concepts}]`);
    lines.push(r.text);
    lines.push("");
  }

  if (displayed.length < filtered.length) {
    lines.push(`... 还有 ${filtered.length - displayed.length} 条未显示`);
  }

  return lines.join("\n");
}

async function formatStats(store: MemoryStore): Promise<string> {
  const all = await store.searchByQuery("", 1000, "like", ["text"]);
  const categories: Record<string, number> = {};
  let totalImportance = 0;
  let oldest = Infinity;
  let newest = 0;

  for (const r of all) {
    categories[r.category] = (categories[r.category] ?? 0) + 1;
    totalImportance += r.importance;
    if (r.created_at < oldest) oldest = r.created_at;
    if (r.created_at > newest) newest = r.created_at;
  }

  const lines: string[] = [
    `记忆总数: ${all.length}`,
    `时间跨度: ${oldest < Infinity ? formatTime(oldest) : "N/A"} ~ ${newest > 0 ? formatTime(newest) : "N/A"}`,
    `平均重要性: ${all.length > 0 ? (totalImportance / all.length).toFixed(2) : "N/A"}`,
    "",
    "分类分布:",
  ];

  for (const [cat, count] of Object.entries(categories).sort(
    (a, b) => b[1] - a[1]
  )) {
    const bar = "█".repeat(Math.round((count / all.length) * 20));
    lines.push(`  ${getCategoryLabel(cat)} (${cat}): ${count} ${bar}`);
  }

  return lines.join("\n");
}

async function formatSearch(
  store: MemoryStore,
  query: string
): Promise<string> {
  if (!query) return "用法: search 需要 query 参数";

  const results = await store.searchByQuery(query, 20, "fts", ["text"]);
  // FTS 对中文支持有限，补充 LIKE 搜索
  const likeResults = await store.searchByQuery(query, 20, "like", ["text"]);

  // Merge dedup
  const seen = new Set<string>();
  const merged: typeof results = [];
  for (const r of [...results, ...likeResults]) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      merged.push(r);
    }
  }

  if (merged.length === 0) {
    return `搜索 "${query}" — 无结果`;
  }

  const lines = [`搜索 "${query}" — 找到 ${merged.length} 条结果\n`];

  for (let i = 0; i < merged.length; i++) {
    const r = merged[i];
    const concepts = (r.metadata?.concepts as string[] | undefined)?.join(", ") ?? "(无)";
    lines.push(`${i + 1}. [${r.id.slice(0, 8)}] [${getCategoryLabel(r.category)}] [重要性: ${r.importance}] [标签: ${concepts}]`);
    lines.push(r.text);
    lines.push("");
  }

  return lines.join("\n");
}

async function deleteMemories(
  store: MemoryStore,
  ids: string
): Promise<string> {
  const prefixes = ids
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (prefixes.length === 0) {
    return "用法: delete 需要 ID 前缀参数（逗号分隔多个）";
  }

  const all = await store.searchByQuery("", 1000, "like", ["text"]);

  const toDelete: { fullId: string; prefix: string; text: string }[] = [];
  const notFound: string[] = [];

  for (const prefix of prefixes) {
    const match = all.find((r) => r.id.startsWith(prefix));
    if (match) {
      toDelete.push({
        fullId: match.id,
        prefix,
        text: match.text.slice(0, 80),
      });
    } else {
      notFound.push(prefix);
    }
  }

  const lines: string[] = ["即将删除以下记忆：\n"];
  for (const item of toDelete) {
    lines.push(`  [${item.prefix}] ${item.text}`);
  }
  for (const prefix of notFound) {
    lines.push(`  [${prefix}] — 未找到`);
  }
  lines.push("");

  for (const item of toDelete) {
    await store.delete(item.fullId);
  }

  lines.push(
    `已删除 ${toDelete.length} 条记忆${notFound.length > 0 ? `，${notFound.length} 条未找到` : ""}`
  );

  return lines.join("\n");
}

const VALID_CATEGORIES: MemoryCategory[] = [
  "profile", "preference", "knowledge", "fact", "gotcha", "experience", "requirement",
];

interface AddOptions {
  sessionId: string;
  importance: number;
  project: string;
  concepts: string[];
}

async function addMemory(
  store: MemoryStore,
  embedder: EmbeddingClient | undefined,
  text: string,
  category: MemoryCategory | undefined,
  options: AddOptions,
): Promise<string> {
  if (!text || text.trim().length < 20) {
    return `添加失败：记忆正文至少需要 20 字符（当前 ${text.trim().length} 字符）`;
  }

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return `添加失败：必须指定有效分类（${VALID_CATEGORIES.join("/")})`;
  }

  if (!embedder) {
    return "添加失败：Embedding 服务不可用";
  }

  try {
    const embedding = await embedder.embedSingle(text.trim());
    const vector = embedder.toFloat32Array(embedding);

    const memory = await store.add({
      text: text.trim(),
      vector,
      category,
      project: options.project,
      session_id: options.sessionId,
      importance: options.importance,
      metadata: { concepts: options.concepts },
    });

    return [
      "添加成功！",
      `  ID: ${memory.id}`,
      `  分类: ${getCategoryLabel(category)}`,
      `  项目: ${options.project}`,
      `  重要性: ${options.importance}`,
      `  标签: ${options.concepts.join(", ") || "(无)"}`,
      `  正文: ${memory.text.slice(0, 100)}${memory.text.length > 100 ? "..." : ""}`,
    ].join("\n") + ECHO_REMINDER;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `添加失败：${message}`;
  }
}

interface UpdateOptions {
  text?: string;
  category?: MemoryCategory;
  importance?: number;
  project?: string;
  concepts?: string[];
}

async function updateMemory(
  store: MemoryStore,
  embedder: EmbeddingClient | undefined,
  idPrefix: string,
  options: UpdateOptions,
): Promise<string> {
  if (!idPrefix) {
    return "更新失败：必须指定 ID 前缀（通过 query 参数）";
  }

  const all = await store.searchByQuery("", 1000, "like", ["text"]);
  const match = all.find((r) => r.id.startsWith(idPrefix));

  if (!match) {
    return `更新失败：未找到 ID 前缀为 ${idPrefix} 的记忆`;
  }

  const hasChanges = options.text !== undefined || options.category !== undefined ||
    options.importance !== undefined || options.project !== undefined || options.concepts !== undefined;

  if (!hasChanges) {
    return "更新失败：未提供任何需要修改的字段";
  }

  try {
    const updates: Record<string, unknown> = {};

    if (options.text !== undefined) {
      const trimmed = options.text.trim();
      if (trimmed.length < 20) {
        return `更新失败：记忆正文至少需要 20 字符（当前 ${trimmed.length} 字符）`;
      }
      updates.text = trimmed;

      if (embedder) {
        const embedding = await embedder.embedSingle(trimmed);
        updates.vector = embedder.toFloat32Array(embedding);
      }
    }

    if (options.category !== undefined) {
      if (!VALID_CATEGORIES.includes(options.category)) {
        return `更新失败：无效分类（${VALID_CATEGORIES.join("/")})`;
      }
      updates.category = options.category;
    }

    if (options.importance !== undefined) {
      updates.importance = options.importance;
    }

    if (options.project !== undefined) {
      updates.project = options.project;
    }

    if (options.concepts !== undefined) {
      updates.metadata = { concepts: options.concepts };
    }

    await store.update(match.id, updates);

    return [
      "更新成功！",
      `  ID: ${match.id}`,
      options.text !== undefined ? `  正文: ${options.text.trim().slice(0, 100)}${options.text.trim().length > 100 ? "..." : ""}` : null,
      options.category !== undefined ? `  分类: ${getCategoryLabel(options.category)}` : null,
      options.importance !== undefined ? `  重要性: ${options.importance}` : null,
      options.project !== undefined ? `  项目: ${options.project}` : null,
      options.concepts !== undefined ? `  标签: ${options.concepts.join(", ") || "(无)"}` : null,
    ].filter(Boolean).join("\n") + ECHO_REMINDER;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `更新失败：${message}`;
  }
}
