/**
 * Memory Injector - Context Injection via system.transform Hook
 *
 * Injects relevant memories into the system prompt as <system-reminder>.
 * Called from runtime.onSystemTransform — sub-session filtering happens there.
 */

import type { MemoryRetriever } from "./retriever.js";
import type { Memory, MemoryCategory } from "./store.js";
import { createDebugLog } from "../debug.js";

const debugLog = createDebugLog("[wopal-memory]", "memory");

export class MemoryInjector {
  private retriever: MemoryRetriever;

  constructor(retriever: MemoryRetriever) {
    this.retriever = retriever;
  }

  async isEmpty(): Promise<boolean> {
    return this.retriever.isEmpty();
  }

  /**
   * Format memories for system prompt injection.
   * Returns formatted string or undefined if no memories found.
   */
  async formatForSystem(userQuery: string): Promise<string | undefined> {
    try {
      const memories = await this.retriever.retrieve(userQuery);

      if (memories.length === 0) {
        debugLog(`[inject] No relevant memories found`);
        return undefined;
      }

      const formatted = this.formatMemories(memories);
      const tokens = Math.ceil(
        memories.reduce((sum, m) => sum + m.text.length, 0) / 4
      );
      debugLog(`[inject] ${memories.length} memories (${tokens} tokens) injected`);

      return formatted;
    } catch (error) {
      debugLog(`[inject] Retrieval failed: ${error}`);
      return undefined;
    }
  }

  private formatMemories(memories: Memory[]): string {
    const TOKEN_BUDGET = 1500;
    const lines: string[] = ["# 相关记忆", ""];
    let totalTokens = 0;
    const tokens = (s: string) => Math.ceil(s.length / 4);

    const categoryLabels: Record<string, string> = {
      requirement: "约束",
      gotcha: "避坑",
      experience: "经验",
      fact: "事实",
      knowledge: "知识",
      preference: "偏好",
      profile: "画像",
    };

    const order: MemoryCategory[] = [
      "requirement", "gotcha", "experience", "fact",
      "knowledge", "preference", "profile",
    ];

    const groups = new Map<string, Memory[]>();
    for (const m of memories) {
      if (!groups.has(m.category)) groups.set(m.category, []);
      groups.get(m.category)!.push(m);
    }

    const tryPush = (line: string): boolean => {
      const t = tokens(line);
      if (totalTokens + t > TOKEN_BUDGET) return false;
      lines.push(line);
      totalTokens += t;
      return true;
    };

    for (const cat of order) {
      const group = groups.get(cat);
      if (!group) continue;

      if (!tryPush(`## ${categoryLabels[cat] ?? cat}`)) break;
      if (!tryPush("")) break;

      for (const memory of group) {
        if (!tryPush(`- ${this.cleanBody(memory.text)}`)) break;
      }
      if (!tryPush("")) break;
    }

    for (const [cat, group] of groups) {
      if (order.includes(cat as MemoryCategory)) continue;
      if (!tryPush(`## ${categoryLabels[cat] ?? cat}`)) break;
      if (!tryPush("")) break;
      for (const memory of group) {
        if (!tryPush(`- ${this.cleanBody(memory.text)}`)) break;
      }
      if (!tryPush("")) break;
    }

    return this.wrapLines(lines);
  }

  /**
   * Clean body text for injection
   *
   * Handles legacy format artifacts from pre-optimization memories:
   * - Strip ## [xxx]: category prefix
   * - Convert **Label**: bold labels to plain text
   */
  private cleanBody(text: string): string {
    let cleaned = text;
    cleaned = cleaned.replace(/^##\s*\[[^\]]+\]:\s*/, "");
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*[:：]/g, "$1：");
    return cleaned.trim();
  }

  private wrapLines(lines: string[]): string {
    return `<system-reminder>\n${lines.join("\n")}\n</system-reminder>`;
  }
}
