/**
 * Memory Retriever - Vector Search with Dynamic Threshold
 *
 * Uses vector similarity as the sole recall path (FTS/LIKE removed —
 * ineffective for Chinese). Applies dynamic threshold based on
 * similarity distribution (top-quartile cutoff) so only truly
 * relevant memories are injected, regardless of total memory count.
 */

import type { MemoryStore, Memory } from "./store.js";
import type { EmbeddingClient } from "./embedder.js";
import { createDebugLog } from "../debug.js";

const debugLog = createDebugLog("[wopal-memory]", "memory");

const DEFAULT_LIMIT = 8;

const DECAY_FACTOR = 0.005;

export interface RetrieveOptions {
  limit?: number;
}

interface MemoryWithScore extends Memory {
  score: number;
  similarityScore: number;
  recencyScore: number;
  importanceScore: number;
}

export class MemoryRetriever {
  private store: MemoryStore;
  private embedder: EmbeddingClient;
  private emptyCache: boolean | undefined;

  constructor(store: MemoryStore, embedder: EmbeddingClient) {
    this.store = store;
    this.embedder = embedder;
  }

  async isEmpty(): Promise<boolean> {
    if (this.emptyCache === false) return false;
    const count = await this.store.count();
    const empty = count === 0;
    if (!empty) this.emptyCache = false;
    return empty;
  }

  /**
   * Retrieve relevant memories for a query
   *
   * Steps:
   * 1. Embed query → vector
   * 2. Vector search only (limit * 2 for recall buffer)
   * 3. Rank by similarity (primary) + recency/importance (boost)
   * 4. Deduplicate by id
   * 5. Dynamic threshold: top-quartile similarity as cutoff
   * 6. Hard limit on result count
   */
  async retrieve(
    query: string,
    options?: RetrieveOptions,
  ): Promise<Memory[]> {
    const limit = options?.limit ?? DEFAULT_LIMIT;

    debugLog(`Retrieving memories for query:\n${query}`);

    const queryVector = this.embedder.toFloat32Array(
      await this.embedder.embedSingle(query),
    );

    const vectorResults = await this.store.search(queryVector, limit * 2);

    if (vectorResults.length === 0) {
      debugLog("No vector search results");
      return [];
    }

    const scoredMemories = this.rankMemories(vectorResults);
    const deduplicated = this.deduplicateById(scoredMemories);

    const threshold = this.computeDynamicThreshold(deduplicated);
    const filtered = deduplicated.filter(m => m.similarityScore >= threshold);

    debugLog(
      `Vector: ${vectorResults.length}, After dedup: ${deduplicated.length}, ` +
      `Threshold: ${threshold.toFixed(3)}, Passed: ${filtered.length}, ` +
      `Similarities: [${deduplicated.map(m => m.similarityScore.toFixed(3)).join(", ")}]`,
    );

    return filtered.slice(0, limit);
  }

  /**
   * Compute dynamic threshold from similarity distribution.
   *
   * Strategy: top-quartile (Q3) of similarity scores.
   * - If only 1-2 memories, require them to be highly similar (0.6+)
   * - If 3+ memories, use the median as floor, but never below 0.35
   * - If 6+ memories, use top-quartile (Q3)
   *
   * This ensures only the most relevant cluster is returned,
   * adapting to both sparse and dense memory stores.
   */
  private computeDynamicThreshold(memories: MemoryWithScore[]): number {
    const similarities = memories
      .map(m => m.similarityScore)
      .sort((a, b) => a - b);

    const n = similarities.length;

    if (n <= 2) {
      return 0.6;
    }

    if (n <= 5) {
      const median = similarities[Math.floor(n / 2)];
      return Math.max(median, 0.35);
    }

    // Top quartile (Q3): 75th percentile index
    const q3Index = Math.ceil(n * 0.75) - 1;
    return Math.max(similarities[q3Index], 0.35);
  }

  private rankMemories(memories: Memory[]): MemoryWithScore[] {
    const now = Date.now();
    const hoursSinceCreation = (createdAt: number) =>
      (now - createdAt) / (1000 * 60 * 60);

    return memories.map((memory) => {
      const distance = typeof memory._distance === "number" ? memory._distance : 1.0;
      const similarityScore = 1 / (1 + distance);

      const hours = hoursSinceCreation(memory.created_at);
      const recencyScore = 0.05 / (1 + DECAY_FACTOR * hours);

      const importanceScore = memory.importance * 0.05;

      const score = similarityScore + recencyScore + importanceScore;

      return {
        ...memory,
        score,
        similarityScore,
        recencyScore,
        importanceScore,
      };
    });
  }

  private deduplicateById(memories: MemoryWithScore[]): MemoryWithScore[] {
    const byId = new Map<string, MemoryWithScore>();

    for (const memory of memories) {
      const existing = byId.get(memory.id);
      if (!existing || memory.score > existing.score) {
        byId.set(memory.id, memory);
      }
    }

    return Array.from(byId.values()).sort((a, b) => b.score - a.score);
  }
}
