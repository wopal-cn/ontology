/**
 * Distill Engine - Memory Extraction from Sessions
 *
 * Extracts structured memories from conversation history using LLM,
 * with two-stage deduplication (vector pre-filter + LLM decision).
 */

import type { MemoryStore, MemoryCategory } from "./store.js";
import type { EmbeddingClient } from "./embedder.js";
import type { DistillLLMClient } from "./llm-client.js";
import type { SessionMessage } from "../types.js";
import { createDebugLog, createWarnLog } from "../debug.js";
import { loadSessionContext, saveSessionContext, clearSessionContext, type SessionContext } from "./session-context.js";
import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

const debugLog = createDebugLog("[wopal-memory]", "memory");
const warnLog = createWarnLog("[wopal-memory]");

/**
 * Resolve prompt file path from environment variable
 * 
 * Supports:
 * - Absolute path: /path/to/file.md
 * - Home directory: ~/path/to/file.md
 * - Relative path: .wopal/path/to/file.md (relative to cwd)
 */
function resolvePromptFilePath(envVar: string): string | null {
  const envPath = process.env[envVar];
  if (!envPath) return null;

  // Absolute path: use directly
  if (envPath.startsWith("/")) {
    return envPath;
  }

  // Home directory: resolve ~/
  if (envPath.startsWith("~/")) {
    return join(homedir(), envPath.slice(2));
  }

  // Relative path: resolve from cwd (workspace root)
  return join(process.cwd(), envPath);
}

// Prompt file path from environment
const DISTILL_PROMPT_FILE = resolvePromptFilePath("WOPAL_DISTILL_PROMPT_FILE");
const DEDUP_PROMPT_FILE = resolvePromptFilePath("WOPAL_DEDUP_PROMPT_FILE");

// Extraction thresholds
const MIN_CONVERSATION_LENGTH = 100; // Minimum characters to extract
const MAX_CONVERSATION_LENGTH = 8000; // Truncate to this length

// Deduplication threshold (used in LLM prompt context)

/**
 * Result of distillation process
 */
export interface DistillResult {
  memoriesCreated: number;
  memoriesMerged: number;
  memoriesSkipped: number;
  title: string | null;
  depth: "shallow";
}

/**
 * Preview candidate memory before deduplication
 */
export interface PreviewCandidate {
  category: MemoryCategory;
  body: string;
  tags: string[];
  importance: number;
}

// Session storage for pending confirmations
const pendingConfirmations = new Map<string, { candidates: PreviewCandidate[]; title: string | null }>();

export function getPendingConfirmation(sessionID: string): { candidates: PreviewCandidate[]; title: string | null } | undefined {
  return pendingConfirmations.get(sessionID);
}

export function setPendingConfirmation(sessionID: string, data: { candidates: PreviewCandidate[]; title: string | null }): void {
  pendingConfirmations.set(sessionID, data);
}

export function clearPendingConfirmation(sessionID: string): void {
  pendingConfirmations.delete(sessionID);
}

/**
 * Extracted memory from LLM (single-layer body)
 */
export interface ExtractResult {
  memories: Array<{
    category: MemoryCategory;
    body: string; // self-contained structured Markdown
    tags: string[];
  }>;
  title?: string;
}

/**
 * Category label for display (updated to semantic labels)
 */
const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  profile: "用户画像",
  preference: "用户偏好",
  knowledge: "技术知识",
  fact: "项目事实",
  gotcha: "避坑方法",
  experience: "实践经验",
  requirement: "用户要求",
};

/**
 * Reverse map: Chinese tag → English category key
 * Used for post-processing validation — body title prefix wins over LLM category
 */
const TAG_TO_CATEGORY: Record<string, MemoryCategory> = {
  "用户画像": "profile",
  "画像": "profile", // backward compatibility
  "用户偏好": "preference",
  "偏好": "preference", // backward compatibility
  "技术知识": "knowledge",
  "知识": "knowledge", // backward compatibility
  "项目事实": "fact",
  "事实": "fact", // backward compatibility
  "避坑方法": "gotcha",
  "实践经验": "experience",
  "经验": "experience", // backward compatibility
  "用户要求": "requirement",
};

/**
 * Load extraction prompt from file or return default
 */
function loadPromptTemplate(): string {
  // Try file path from environment
  if (DISTILL_PROMPT_FILE && existsSync(DISTILL_PROMPT_FILE)) {
    try {
      const content = readFileSync(DISTILL_PROMPT_FILE, "utf-8");
      debugLog(`Loaded distill prompt from: ${DISTILL_PROMPT_FILE}`);
      return content;
    } catch (error) {
      warnLog(`Failed to load distill prompt from ${DISTILL_PROMPT_FILE}: ${error}`);
    }
  }

  // Fallback: try default path
  const defaultPath = join(homedir(), ".wopal", "agents", "wopal", "prompts", "distill.md");
  if (existsSync(defaultPath)) {
    try {
      const content = readFileSync(defaultPath, "utf-8");
      debugLog(`Loaded distill prompt from default path: ${defaultPath}`);
      return content;
    } catch (error) {
      warnLog(`Failed to load distill prompt from default path: ${error}`);
    }
  }

  // Return embedded default prompt (simplified version for fallback)
  debugLog("Using embedded default distill prompt");
  return `# 记忆提取 Prompt（默认版本）

分析以下会话内容，提取值得长期保存的记忆。

## 最近对话
{{conversation}}

---

# 分类体系（7 类）

| 中文标签 | 英文 category | 定义 |
|---------|--------------|------|
| 用户画像 | profile | 用户身份、静态属性 |
| 用户偏好 | preference | 用户习惯、倾向、风格（非强制） |
| 技术知识 | knowledge | 本空间/项目特有的技术理解、内部机制 |
| 项目事实 | fact | 本空间/项目特有的客观事实、路径约定 |
| 避坑方法 | gotcha | 历史错误、预防措施（必须有踩坑经历） |
| 实践经验 | experience | 可复用流程、方法论 |
| 用户要求 | requirement | 用户明确要求必须遵守的规则/行为 |

# 输出格式

返回 JSON 对象。示例：
{"memories": [{"category": "knowledge", "body": "## [技术知识]: 主题\\n**背景**: ...\\n**内容**: ...", "tags": ["tag"]}]}

如果无记忆可提取，返回 {"memories": []}`;
}

/**
 * Validate and fix category based on body title prefix.
 * Returns corrected { category, body } — title prefix is the source of truth.
 */
function validateCategory(
  rawCategory: string,
  body: string
): { category: MemoryCategory; body: string } {
  const match = body.match(/^## \[(.+?)\]/);
  if (match) {
    const tag = match[1];
    const inferred = TAG_TO_CATEGORY[tag];
    if (inferred) {
      return { category: inferred, body };
    }
  }
  // No valid prefix — use LLM category, prepend prefix to body
  const category = rawCategory as MemoryCategory;
  const label = CATEGORY_LABELS[category] ?? category;
  return {
    category,
    body: body.replace(/^## /, `## [${label}]: `),
  };
}

/**
 * Extract conversation text from session messages
 *
 * Strategy:
 * - user messages: only text parts that are not ignored
 * - assistant messages: only text parts that are not synthetic
 * - skip compaction messages entirely
 * - merge consecutive same-role messages
 * - filter <system-reminder> tags from final output
 * - output as JSON array of {role, content}
 */
function extractConversationText(messages: SessionMessage[]): string {
  interface DialogueTurn { role: "user" | "assistant"; content: string }

  const turns: DialogueTurn[] = [];
  let skipNext = false;

  for (const msg of messages) {
    const role = msg.info?.role;
    if (role !== "user" && role !== "assistant") continue;
    if (!msg.parts) continue;

    // Skip compaction messages AND their immediate response.
    // OpenCode compaction creates a pair: user "What did we do so far?"
    // (has compaction part) + assistant summary (text-only, no compaction part).
    // Both must be skipped to prevent summary leakage.
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (msg.parts.some((p) => p.type === "compaction")) {
      skipNext = true;
      continue;
    }

    const textParts: string[] = [];

    for (const part of msg.parts) {
      // Only extract text parts
      if (part.type !== "text" || !part.text) continue;

      // assistant: skip synthetic parts (tool output replayed as text)
      // Note: user `ignored` parts are NOT filtered — slash command expansions
      // and other system-attached text carry user intent; removing them breaks
      // conversation continuity and degrades distillation quality.
      const partData = part as { text: string; synthetic?: boolean };
      if (role === "assistant" && partData.synthetic) continue;

      textParts.push(part.text);
    }

    if (textParts.length === 0) continue;

    const content = textParts.join("\n\n");

    // Merge with previous turn if same role
    if (turns.length > 0 && turns[turns.length - 1].role === role) {
      turns[turns.length - 1].content += "\n\n" + content;
    } else {
      turns.push({ role, content });
    }
  }

  if (turns.length === 0) return "";

  // Truncate from the front: keep most recent turns that fit within limit.
  // This ensures the JSON output is never cut mid-string.
  let kept: DialogueTurn[] = [];
  let charBudget = MAX_CONVERSATION_LENGTH;
  for (let i = turns.length - 1; i >= 0; i--) {
    const estimated = JSON.stringify(turns[i]).length + 4; // +4 for comma/newline overhead
    // Hard cap: even the first (most recent) turn must not exceed budget alone
    if (estimated > charBudget) break;
    if (kept.length > 0 && charBudget < estimated) break;
    charBudget -= estimated;
    kept.unshift(turns[i]);
  }

  const json = JSON.stringify(
    kept.map((t) => ({ role: t.role, content: t.content })),
    null,
    2
  );

  return filterSystemReminder(json);
}

/**
 * Filter out <system-reminder> blocks from text
 * These are appended by OpenCode's read tool and should not be distilled
 */
function filterSystemReminder(text: string): string {
  // Match <system-reminder>...</system-reminder> blocks (including newlines)
  const filtered = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
  return filtered;
}

/**
 * Default importance by category (hardcoded, replaces unreliable LLM self-rating)
 */
function getDefaultImportance(category: MemoryCategory): number {
  switch (category) {
    case "requirement": return 0.95;
    case "profile": return 0.9;
    case "gotcha": return 0.85;
    case "experience": return 0.85;
    case "preference": return 0.8;
    case "fact": return 0.75;
    case "knowledge": return 0.7;
    default: return 0.5;
  }
}

/**
 * Build extraction prompt for LLM (always reads from file for hot-reload)
 */
function buildExtractionPrompt(conversation: string): string {
  return loadPromptTemplate().replace("{{conversation}}", conversation);
}

/**
 * Build deduplication prompt — single LLM call for decision + merge content
 */
/**
 * Build deduplication prompt — single LLM call for decision + merge content
 */
function buildBatchDedupPrompt(
  candidates: Array<{ index: number; category: string; body: string }>,
  existingByCandidate: Map<number, Array<{ index: number; body: string; id: string }>>
): string {
  const candidatesWithExisting = candidates.filter(
    (c) => existingByCandidate.has(c.index) && existingByCandidate.get(c.index)!.length > 0
  );

  const input = candidatesWithExisting.map((c) => {
    const existing = existingByCandidate.get(c.index)!;
    return {
      candidate: { index: c.index, category: c.category, body: c.body },
      similar_existing: existing.map((e) => ({ index: e.index, body: e.body })),
    };
  });

  // Try loading from file
  if (DEDUP_PROMPT_FILE && existsSync(DEDUP_PROMPT_FILE)) {
    try {
      const template = readFileSync(DEDUP_PROMPT_FILE, "utf-8");
      debugLog(`Loaded dedup prompt from: ${DEDUP_PROMPT_FILE}`);
      return template.replace("{{input}}", JSON.stringify(input, null, 2));
    } catch (error) {
      warnLog(`Failed to load dedup prompt from ${DEDUP_PROMPT_FILE}: ${error}`);
    }
  }

  // Fallback: inline prompt
  return `你是记忆去重器。对每条候选，与已有相似记忆对比后做出决策。

输入：
${JSON.stringify(input, null, 2)}

操作：create（不相关，应新建）/ skip（重复）/ merge（补充新细节）/ replace（事实已变化）

关键约束：
- 同关键词 ≠ 重复：两条都提到"确认"不代表是同一条要求
- requirement 类型：两条不同的用户要求应并存（create），不要合并
- create：候选与已有记忆说的是不同的事情，应该同时存在
- skip：候选的所有关键信息都已在已有记忆中
- merge：候选补充了已有记忆没有的新细节，输出 merged_body 和 tags
- replace：候选与已有记忆冲突（旧的对新的错），用候选替换

输出 JSON：
{"decisions": [{"index": 1, "action": "create"}, {"index": 2, "action": "skip"}, {"index": 3, "action": "merge", "merge_into": 1, "merged_body": "合并后完整内容", "tags": ["tag1"]}]}`;
}

/**
 * Load extraction state from disk (delegates to SessionContext)
 */
export function loadExtractionState(sessionID: string): SessionContext | null {
  return loadSessionContext(sessionID);
}

/**
 * Clear extraction state for a session (delegates to SessionContext)
 */
export function clearExtractionState(sessionID: string): void {
  clearSessionContext(sessionID);
}

/**
 * Distill Engine - Extract memories from session conversation
 */
export class DistillEngine {
  private store: MemoryStore;
  private embedder: EmbeddingClient;
  private llm: DistillLLMClient;

  constructor(
    store: MemoryStore,
    embedder: EmbeddingClient,
    llm: DistillLLMClient
  ) {
    this.store = store;
    this.embedder = embedder;
    this.llm = llm;
  }

  /**
   * Distill memories from session messages
   *
   * Steps:
   * 1. Extract conversation text (user + assistant)
   * 2. Truncate to MAX_CONVERSATION_LENGTH
   * 3. Skip if too short (< MIN_CONVERSATION_LENGTH)
   * 4. LLM extraction (6 categories)
   * 5. Two-stage deduplication
   * 6. Write to memories table
   * 7. Record extraction state
   * 8. Generate title
   */
  async distill(
    sessionID: string,
    messages: SessionMessage[],
    project: string = "wopal-space"
  ): Promise<DistillResult> {
    debugLog(`[distill] session=${sessionID}, project=${project}, messages=${messages.length}`);

    const existingState = loadExtractionState(sessionID);
    if (existingState?.distill) {
      debugLog(`[distill] Already extracted at ${existingState.distill.extractedAt}`);
      return {
        memoriesCreated: 0, // SessionContext doesn't store these legacy fields
        memoriesMerged: 0,
        memoriesSkipped: 0,
        title: existingState.title,
        depth: "shallow" as const, // Always shallow for now (deep not implemented)
      };
    }

    const conversation = extractConversationText(messages);

    if (conversation.length < MIN_CONVERSATION_LENGTH) {
      debugLog(`[distill] Too short (${conversation.length} chars), skip`);
      return { memoriesCreated: 0, memoriesMerged: 0, memoriesSkipped: 0, title: null, depth: "shallow" };
    }

    const extractionPrompt = buildExtractionPrompt(conversation);

    let extractResult: ExtractResult;
    try {
      extractResult = await this.llm.completeJson<ExtractResult>(extractionPrompt);
    } catch (error) {
      warnLog(`[distill] LLM extraction failed: ${error}`);
      return { memoriesCreated: 0, memoriesMerged: 0, memoriesSkipped: 0, title: null, depth: "shallow" };
    }

    if (!extractResult.memories || extractResult.memories.length === 0) {
      debugLog(`[distill] No memories extracted`);
      return { memoriesCreated: 0, memoriesMerged: 0, memoriesSkipped: 0, title: extractResult.title ?? null, depth: "shallow" };
    }

    const dedupResult = await this.deduplicate(extractResult.memories, sessionID, project);

    for (const memory of dedupResult.create) {
      await this.store.add({
        text: memory.text,
        vector: memory.vector,
        category: memory.category,
        project,
        session_id: sessionID,
        importance: memory.importance,
        tags: memory.tags,
        metadata: memory.metadata,
      });
    }

    for (const merge of dedupResult.merge) {
      await this.store.update(merge.existingId, {
        text: merge.body,
        vector: merge.vector,
        tags: merge.tags.join(","),
        metadata: merge.metadata,
      });
    }

    // Save to SessionContext
    const ctx: SessionContext = {
      sessionID,
      title: extractResult.title ?? null,
      distill: {
        messageCount: messages.length,
        extractedAt: new Date().toISOString(),
        depth: "shallow",
      },
    };
    saveSessionContext(ctx);

    let title = extractResult.title;

    debugLog(`[distill] Done: created=${dedupResult.create.length}, merged=${dedupResult.merge.length}, skipped=${dedupResult.skip.length}`);
    return {
      memoriesCreated: dedupResult.create.length,
      memoriesMerged: dedupResult.merge.length,
      memoriesSkipped: dedupResult.skip.length,
      title: title ?? null,
      depth: "shallow",
    };
  }

  /**
   * Preview memories from session messages without writing to database
   * Returns raw candidates before deduplication for user review
   */
  async preview(
    sessionID: string,
    messages: SessionMessage[]
  ): Promise<{ candidates: PreviewCandidate[]; title: string | null }> {
    debugLog(`[preview] session=${sessionID}, messages=${messages.length}`);

    const conversation = extractConversationText(messages);

    if (conversation.length < MIN_CONVERSATION_LENGTH) {
      debugLog(`[preview] Too short (${conversation.length} chars), skip`);
      return { candidates: [], title: null };
    }

    const extractionPrompt = buildExtractionPrompt(conversation);

    let extractResult: ExtractResult;
    try {
      extractResult = await this.llm.completeJson<ExtractResult>(extractionPrompt);
    } catch (error) {
      warnLog(`[preview] LLM extraction failed: ${error}`);
      return { candidates: [], title: null };
    }

    if (!extractResult.memories || extractResult.memories.length === 0) {
      debugLog(`[preview] No memories extracted`);
      return { candidates: [], title: extractResult.title ?? null };
    }

    const candidates: PreviewCandidate[] = extractResult.memories.map((m) => {
      const validated = validateCategory(m.category, m.body);
      return {
        category: validated.category,
        body: validated.body,
        tags: m.tags ?? [],
        importance: getDefaultImportance(validated.category),
      };
    });

    let title = extractResult.title;

    debugLog(`[preview] ${candidates.length} candidates`);
    return { candidates, title: title ?? null };
  }

  /**
   * Two-stage deduplication (Phase 1.5: per-candidate LLM decision with merge)
   *
   * 1. Vector pre-filter: embed new memories → search similar
   * 2. Per-candidate LLM decision: ask LLM to decide create/merge/skip/replace
   * 3. For merge/replace: call LLM merge prompt
   */
  private async deduplicate(
    newMemories: ExtractResult["memories"],
    _sessionID: string,
    _project: string
  ): Promise<{
    create: Array<{
      text: string;
      vector: Float32Array;
      category: MemoryCategory;
      importance: number;
      tags: string[];
      metadata: Record<string, unknown>;
    }>;
    merge: Array<{
      existingId: string;
      existingBody: string;
      body: string;
      vector: Float32Array;
      tags: string[];
      metadata: Record<string, unknown>;
    }>;
    skip: Array<{ reason: string }>;
  }> {
    const result = {
      create: [] as Array<{
        text: string;
        vector: Float32Array;
        category: MemoryCategory;
        importance: number;
        tags: string[];
        metadata: Record<string, unknown>;
      }>,
      merge: [] as Array<{
        existingId: string;
        existingBody: string;
        body: string;
        vector: Float32Array;
        tags: string[];
        metadata: Record<string, unknown>;
      }>,
      skip: [] as Array<{ reason: string }>,
    };

    // Validate & fix category via title prefix before embedding
    const validated = newMemories.map((m) => validateCategory(m.category, m.body));

    // Embed all new memories
    const embeddings = await this.embedder.embed(
      validated.map((m) => m.body)
    );

    // Vector pre-filter: collect similar existing memories for each candidate
    const candidatesForPrompt = validated.map((v, i) => ({
      index: i + 1,
      category: v.category,
      body: v.body,
    }));

    // Maximum L2 distance to consider "similar" for dedup purposes.
    // Based on similarityScore = 1 - (distance^2)/2, a distance of 1.0
    // gives similarityScore ≈ 0.5 which is well below retrieval threshold.
    const DEDUP_MAX_DISTANCE = 1.0;

    const existingByCandidate = new Map<number, Array<{ index: number; body: string; id: string; tags: string; metadata: Record<string, unknown> }>>();
    for (let i = 0; i < validated.length; i++) {
      const vector = this.embedder.toFloat32Array(embeddings[i]);
      const similar = await this.store.search(vector, 5);
      const filtered = similar.filter((m) => {
        const dist = typeof m._distance === "number" ? m._distance : Infinity;
        return dist <= DEDUP_MAX_DISTANCE;
      });
      if (filtered.length > 0) {
        existingByCandidate.set(i + 1, filtered.map((m, idx) => ({
          index: idx + 1,
          body: m.text,
          id: m.id,
          tags: m.tags ?? "",
          metadata: (m.metadata as Record<string, unknown>) ?? {},
        })));
      }
    }

    // Candidates without similar existing memories can be created directly
    for (let i = 0; i < validated.length; i++) {
      if (!existingByCandidate.has(i + 1)) {
        const { category, body } = validated[i];
        const vector = this.embedder.toFloat32Array(embeddings[i]);
        const importance = getDefaultImportance(category);
        result.create.push({
          text: body, vector, category, importance,
          tags: newMemories[i].tags ?? [],
          metadata: {},
        });
      }
    }

    // Skip LLM dedup entirely if no candidate has similar existing memories
    const candidatesNeedingDedup = candidatesForPrompt.filter(
      (c) => existingByCandidate.has(c.index) && existingByCandidate.get(c.index)!.length > 0
    );

    if (candidatesNeedingDedup.length === 0) {
      debugLog(`[deduplicate] No existing similar memories found, all candidates created directly`);
      return result;
    }

    const dedupPrompt = buildBatchDedupPrompt(candidatesForPrompt, existingByCandidate);

    interface BatchDecision {
      decisions: Array<{
        index: number;
        action: string;
        merge_into?: number;
        replace_existing?: number;
        merged_body?: string;
        tags?: string[];
      }>;
    }

    let batchResult: BatchDecision;
    try {
      batchResult = await this.llm.completeJson<BatchDecision>(dedupPrompt);
    } catch (error) {
      warnLog(`[deduplicate] Batch LLM failed: ${error}`);
      // On LLM failure, create all candidates that needed dedup as new memories
      for (let i = 0; i < validated.length; i++) {
        if (existingByCandidate.has(i + 1)) {
          const { category, body } = validated[i];
          const vector = this.embedder.toFloat32Array(embeddings[i]);
          const importance = getDefaultImportance(category);
          result.create.push({
            text: body, vector, category, importance,
            tags: newMemories[i].tags ?? [],
            metadata: {},
          });
        }
      }
      return result;
    }

    for (const dec of batchResult.decisions ?? []) {
      const i = dec.index - 1;
      if (i < 0 || i >= validated.length) continue;

      const { category, body } = validated[i];
      const vector = this.embedder.toFloat32Array(embeddings[i]);
      const importance = getDefaultImportance(category);
      const tags: string[] = newMemories[i].tags ?? [];
      const metadata: Record<string, unknown> = {};

      if (dec.action === "skip") {
        result.skip.push({ reason: "duplicate" });
      } else if (dec.action === "create") {
        // LLM decided candidate is unrelated to existing memories — create as new
        result.create.push({ text: body, vector, category, importance, tags, metadata });
      } else if ((dec.action === "merge" || dec.action === "replace") && (dec.merge_into !== undefined || dec.replace_existing !== undefined)) {
        const matchIdx = dec.action === "replace" ? dec.replace_existing! : dec.merge_into!;
        const existingList = existingByCandidate.get(dec.index);
        const matchedExisting = existingList?.[matchIdx - 1];
        if (!matchedExisting) {
          warnLog(`[deduplicate] match ${matchIdx} out of range for candidate ${dec.index}`);
          result.create.push({ text: body, vector, category, importance, tags, metadata });
          continue;
        }

        // replace: use candidate body as-is; merge: use LLM merged_body
        const mergedBody = dec.action === "replace" ? body : (dec.merged_body ?? body);
        const mergedConcepts = Array.from(
          new Set([
            ...(matchedExisting.tags?.split(",") ?? []),
            ...(dec.tags ?? []),
          ])
        );

        const [mergedEmbedding] = await this.embedder.embed([mergedBody]);
        const mergedVector = this.embedder.toFloat32Array(mergedEmbedding);

        result.merge.push({
          existingId: matchedExisting.id,
          existingBody: matchedExisting.body,
          body: mergedBody,
          vector: mergedVector,
          tags: mergedConcepts,
          metadata: {},
        });
      } else {
        // Unknown action or missing merge target — create as new
        result.create.push({ text: body, vector, category, importance, tags, metadata });
      }
    }

    return result;
  }


  /**
   * Get category label for display
   */
  getCategoryLabel(category: MemoryCategory): string {
    return CATEGORY_LABELS[category] ?? category;
  }

  /**
   * Expose embed method for external use
   */
  embed(text: string): Promise<number[]> {
    return this.embedder.embedSingle(text);
  }

  /**
   * Expose toFloat32Array for external use
   */
  toFloat32Array(embedding: number[]): Float32Array {
    return this.embedder.toFloat32Array(embedding);
  }

  /**
   * Confirm and write selected candidates with deduplication
   * This is the confirm step of two-step distillation workflow
   */
  async confirmCandidates(
    sessionID: string,
    candidates: PreviewCandidate[],
    project: string = "wopal-space"
  ): Promise<{
    created: number;
    merged: number;
    skipped: number;
    mergeDetails: Array<{
      existingId: string;
      existingPreview: string;
      mergedPreview: string;
    }>;
  }> {
    if (candidates.length === 0) {
      return { created: 0, merged: 0, skipped: 0, mergeDetails: [] };
    }

    debugLog(`[confirm] Starting dedup for ${candidates.length} candidates`);

    const memories = candidates.map((c) => ({
      category: c.category,
      body: c.body,
      tags: c.tags,
    }));

    const dedupResult = await this.deduplicate(memories, sessionID, project);

    for (const memory of dedupResult.create) {
      await this.store.add({
        text: memory.text,
        vector: memory.vector,
        category: memory.category,
        project,
        session_id: sessionID,
        importance: memory.importance,
        tags: memory.tags,
        metadata: memory.metadata,
      });
    }

    for (const merge of dedupResult.merge) {
      await this.store.update(merge.existingId, {
        text: merge.body,
        vector: merge.vector,
        tags: merge.tags.join(","),
        metadata: merge.metadata,
      });
    }

    debugLog(`[confirm] Done: created=${dedupResult.create.length}, merged=${dedupResult.merge.length}, skipped=${dedupResult.skip.length}`);

    return {
      created: dedupResult.create.length,
      merged: dedupResult.merge.length,
      skipped: dedupResult.skip.length,
      mergeDetails: dedupResult.merge.map((m) => ({
        existingId: m.existingId,
        existingPreview: m.existingBody.split("\n")[0].slice(0, 80),
        mergedPreview: m.body.split("\n")[0].slice(0, 80),
      })),
    };
  }
}