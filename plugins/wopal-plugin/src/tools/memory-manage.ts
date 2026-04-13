/**
 * memory_manage Tool - Memory CRUD Operations & Distillation
 *
 * List, search, delete, add, stats for LanceDB memories.
 * Also handles memory distillation (preview/confirm/cancel).
 * Registered as a plugin tool so it's always available regardless of install path.
 */

import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin";
import type { MemoryStore, MemoryCategory } from "../memory/store.js";
import type { EmbeddingClient } from "../memory/embedder.js";
import type { SessionStore } from "../session-store.js";
import type { DistillEngine } from "../memory/distill.js";
import {
  clearExtractionState,
  getPendingConfirmation,
  setPendingConfirmation,
  clearPendingConfirmation,
} from "../memory/distill.js";
import type { SessionMessage } from "../types.js";
import {
  formatPreviewReport,
  formatConfirmReportWithDedup,
} from "./distill-formatters.js";

const confirmingSessions = new Set<string>();

const ECHO_REMINDER_DISTILL = [
  "",
  "重要：调用本工具后，你必须将以上完整蒸馏结果逐字展示给用户。用户无法看到工具内部输出，依赖你主动展示。",
  "每条候选记忆必须完整展示所有字段（正文、分类、重要性、标签），严禁省略、摘要或概括。",
  "distill 后必须等用户确认才能执行 confirm，严禁跳过展示直接 confirm。",
].join("\n");

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

export function createMemoryManageTool(
  store: MemoryStore,
  embedder?: EmbeddingClient,
  sessionStore?: SessionStore,
  distillEngine?: DistillEngine,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any,
): ToolDefinition {
  return tool({
    description:
      "管理 LanceDB 中的长期记忆。子命令: list（列出全部）, stats（统计）, search（搜索）, delete（删除）, add（添加单条）, update（更新单条）, injected（查看当前上下文注入的记忆）。 " +
      "Distill current session: distill（预览候选）, confirm（写入数据库）, cancel（丢弃候选）。\n\n" +
      "重要：调用本工具后，必须把 output 的完整文本逐字写入用户回复。严禁概括、严禁摘要、严禁省略任何一条结果。" +
      "用户使用 list 的目的是逐条审查完整内容，以决定删除或调整哪一条记忆。\n\n" +
      "参数用法：search 用 query（关键词）；delete 用 id（记忆 ID，逗号分隔多个）；update 用 id + 要修改的字段。id 从 list/search 结果的方括号中获取（如 [53cc9388] → id=\"53cc9388\"）。禁止将正文内容作为 id 传入。",
    args: {
      command: tool.schema
        .enum(["list", "stats", "search", "delete", "add", "update", "injected", "distill", "confirm", "cancel"])
        .describe("子命令"),
      query: tool.schema
        .string()
        .optional()
        .describe("search 时为搜索关键词（FTS + LIKE 混合检索）"),
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
      tags: tool.schema
        .string()
        .optional()
        .describe("逗号分隔的关键词，用于精确检索"),
      id: tool.schema
        .string()
        .optional()
        .describe("记忆 ID（从 list/search 结果方括号获取，如 53cc9388）。delete 支持逗号分隔多个 ID"),
      force: tool.schema
        .boolean()
        .optional()
        .describe("强制重新蒸馏（仅 distill 命令）"),
      selectedIndices: tool.schema
        .array(tool.schema.number())
        .optional()
        .describe("指定写入的候选索引（仅 confirm 命令，0-based）"),
    },
    execute: async (args, context: ToolContext) => {
      const { command, query, category, limit, text, importance, project, tags, force, selectedIndices, id } = args;

      switch (command) {
        case "list":
          return (await formatList(store, category, limit)) + ECHO_REMINDER;
        case "stats":
          return (await formatStats(store)) + ECHO_REMINDER;
        case "search":
          return (await formatSearch(store, query ?? "", tags)) + ECHO_REMINDER;
        case "delete":
          return (await deleteMemories(store, id ?? "")) + ECHO_REMINDER;
        case "add":
          return (await addMemory(store, embedder, text ?? "", category as MemoryCategory | undefined, {
            sessionId: context.sessionID ?? "unknown",
            importance: importance ?? 0.5,
            project: project ?? "wopal-space",
            tags: tags ? tags.split(",").map(s => s.trim()).filter(Boolean) : [],
          })) + ECHO_REMINDER;
        case "update": {
          const updateOpts: UpdateOptions = {};
          if (text !== undefined) updateOpts.text = text;
          if (category !== undefined) updateOpts.category = category as MemoryCategory;
          if (importance !== undefined) updateOpts.importance = importance;
          if (project !== undefined) updateOpts.project = project;
          if (tags !== undefined) updateOpts.tags = tags.split(",").map(s => s.trim()).filter(Boolean);
          return (await updateMemory(store, embedder, id ?? "", updateOpts)) + ECHO_REMINDER;
        }
        case "injected":
          return (await formatInjected(sessionStore, context.sessionID)) + ECHO_REMINDER;
        case "distill": {
          const sessionID = context.sessionID;
          if (!sessionID) return "Failed: current session ID is unavailable.";
          if (!distillEngine) return "Memory system unavailable. Distillation requires the memory system to be initialized.";
          return await handleDistill(sessionID, distillEngine, client, force);
        }
        case "confirm": {
          const sessionID = context.sessionID;
          if (!sessionID) return "Failed: current session ID is unavailable.";
          if (!distillEngine) return "Memory system unavailable. Distillation requires the memory system to be initialized.";
          return await handleConfirm(sessionID, distillEngine, selectedIndices);
        }
        case "cancel": {
          const sessionID = context.sessionID;
          if (!sessionID) return "Failed: current session ID is unavailable.";
          clearPendingConfirmation(sessionID);
          return "❌ Distillation cancelled. Candidates discarded.";
        }
        default:
          return `未知命令: ${command}`;
      }
    },
  });
}

async function handleDistill(
  sessionID: string,
  distillEngine: DistillEngine,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  force?: boolean,
): Promise<string> {
  if (force) {
    clearExtractionState(sessionID);
    clearPendingConfirmation(sessionID);
  }

  if (typeof client?.session?.messages !== "function") {
    return "Failed: session.messages API is unavailable.";
  }

  try {
    const result = await client.session.messages({ path: { id: sessionID } });
    const messages: SessionMessage[] = result?.data ?? [];

    if (messages.length === 0) {
      return "No messages in current session to distill.";
    }

    const previewResult = await distillEngine.preview(sessionID, messages);

    if (previewResult.candidates.length === 0) {
      return "No memories extracted from this session. The conversation may be too short or contain no long-term valuable information.";
    }

    setPendingConfirmation(sessionID, previewResult);
    return (
      formatPreviewReport(
        previewResult.candidates,
        previewResult.title,
        messages.length,
      ) + ECHO_REMINDER_DISTILL
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Distillation preview failed: ${message}`;
  }
}

async function handleConfirm(
  sessionID: string,
  distillEngine: DistillEngine,
  selectedIndices?: number[],
): Promise<string> {
  if (confirmingSessions.has(sessionID)) {
    return "⚠️ Distillation confirm is already running for this session. Wait for it to finish.";
  }

  const pending = getPendingConfirmation(sessionID);
  if (!pending) {
    return "⚠️ No pending candidates to confirm. Run with command='distill' first.";
  }

  confirmingSessions.add(sessionID);
  clearPendingConfirmation(sessionID);

  try {
    let candidatesToWrite = pending.candidates;
    if (selectedIndices && selectedIndices.length > 0) {
      candidatesToWrite = selectedIndices
        .filter((i) => i >= 0 && i < pending.candidates.length)
        .map((i) => pending.candidates[i]);
      if (candidatesToWrite.length === 0) {
        setPendingConfirmation(sessionID, pending);
        return "⚠️ No valid candidates selected.";
      }
    }

    const result = await distillEngine.confirmCandidates(
      sessionID,
      candidatesToWrite,
      "wopal-space",
    );

    return (
      formatConfirmReportWithDedup(candidatesToWrite, pending.title, result) +
      ECHO_REMINDER_DISTILL
    );
  } catch (error) {
    setPendingConfirmation(sessionID, pending);
    const message = error instanceof Error ? error.message : String(error);
    return `Distillation confirm failed: ${message}`;
  } finally {
    confirmingSessions.delete(sessionID);
  }
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
    const tags = r.tags || "(无)";
    lines.push(`${i + 1}. [${r.id.slice(0, 8)}] [${formatTime(r.created_at)}] [${getCategoryLabel(r.category)}] [重要性: ${r.importance}] [标签: ${tags}]`);
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
  query: string,
  tags?: string
): Promise<string> {
  if (!query && !tags) return "用法: search 需要 query 或 tags 参数";

  // Build full query: append tags as space-separated terms for FTS
  const fullQuery = tags
    ? `${query} ${tags.replace(/,/g, " ")}`.trim()
    : query;

  const results = await store.searchByQuery(fullQuery, 20, "fts");
  // FTS 对中文支持有限，补充 LIKE 搜索
  const likeResults = await store.searchByQuery(query || "", 20, "like");

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
    return `搜索 "${fullQuery}" — 无结果`;
  }

  const lines = [`搜索 "${fullQuery}" — 找到 ${merged.length} 条结果\n`];

  for (let i = 0; i < merged.length; i++) {
    const r = merged[i];
    const tags = r.tags || "(无)";
    lines.push(`${i + 1}. [${r.id.slice(0, 8)}] [${getCategoryLabel(r.category)}] [重要性: ${r.importance}] [标签: ${tags}]`);
    lines.push(r.text);
    lines.push("");
  }

  return lines.join("\n");
}

async function deleteMemories(
  store: MemoryStore,
  ids: string
): Promise<string> {
  const rawIds = ids
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawIds.length === 0) {
    return "用法: delete 需要 id 参数（记忆 ID，逗号分隔多个）。ID 从 list/search 结果方括号中获取";
  }

  const toDelete: { fullId: string; shortId: string; text: string }[] = [];
  const notFound: string[] = [];

  for (const rawId of rawIds) {
    // 先尝试精确匹配完整 UUID
    let memory = await store.get(rawId);
    if (memory) {
      toDelete.push({ fullId: memory.id, shortId: memory.id.slice(0, 8), text: memory.text.slice(0, 80) });
      continue;
    }
    // 再按前缀匹配（list 显示的 8 位短 ID）
    const all = await store.searchByQuery("", 1000, "like", ["text"]);
    const match = all.find((r) => r.id.startsWith(rawId));
    if (match) {
      toDelete.push({ fullId: match.id, shortId: match.id.slice(0, 8), text: match.text.slice(0, 80) });
    } else {
      notFound.push(rawId);
    }
  }

  if (toDelete.length === 0) {
    return `未找到 ID 为 ${rawIds.join(", ")} 的记忆`;
  }

  const lines: string[] = ["即将删除以下记忆：\n"];
  for (const item of toDelete) {
    lines.push(`  [${item.shortId}] ${item.text}`);
  }
  if (notFound.length > 0) {
    lines.push("");
    for (const id of notFound) {
      lines.push(`  [${id}] — 未找到`);
    }
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
  tags: string[];
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
      tags: options.tags,
    });

    return [
      "添加成功！",
      `  ID: ${memory.id}`,
      `  分类: ${getCategoryLabel(category)}`,
      `  项目: ${options.project}`,
      `  重要性: ${options.importance}`,
      `  标签: ${options.tags.join(", ") || "(无)"}`,
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
  tags?: string[];
}

async function updateMemory(
  store: MemoryStore,
  embedder: EmbeddingClient | undefined,
  rawId: string,
  options: UpdateOptions,
): Promise<string> {
  if (!rawId) {
    return "更新失败：必须指定 id 参数（记忆 ID，从 list/search 结果方括号中获取）";
  }

  // 先尝试精确匹配完整 UUID
  let memory = await store.get(rawId);
  // 再按前缀匹配（list 显示的 8 位短 ID）
  if (!memory) {
    const all = await store.searchByQuery("", 1000, "like", ["text"]);
    memory = all.find((r) => r.id.startsWith(rawId)) ?? null;
  }

  if (!memory) {
    return `更新失败：未找到 ID 为 ${rawId} 的记忆`;
  }

  const hasChanges = options.text !== undefined || options.category !== undefined ||
    options.importance !== undefined || options.project !== undefined || options.tags !== undefined;

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

    if (options.tags !== undefined) {
      updates.tags = options.tags.join(",");
    }

    await store.update(memory.id, updates);

    return [
      "更新成功！",
      `  ID: ${memory.id}`,
      options.text !== undefined ? `  正文: ${options.text.trim().slice(0, 100)}${options.text.trim().length > 100 ? "..." : ""}` : null,
      options.category !== undefined ? `  分类: ${getCategoryLabel(options.category)}` : null,
      options.importance !== undefined ? `  重要性: ${options.importance}` : null,
      options.project !== undefined ? `  项目: ${options.project}` : null,
      options.tags !== undefined ? `  标签: ${options.tags.join(", ") || "(无)"}` : null,
    ].filter(Boolean).join("\n") + ECHO_REMINDER;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `更新失败：${message}`;
  }
}

async function formatInjected(
  sessionStore: SessionStore | undefined,
  sessionID: string | undefined,
): Promise<string> {
  if (!sessionStore || !sessionID) {
    return "无法获取注入记忆：缺少会话信息";
  }

  const state = sessionStore.snapshot(sessionID);
  const rawText = state?.injectedRawText;

  if (!rawText) {
    return "当前会话未注入任何记忆";
  }

  return rawText;
}
