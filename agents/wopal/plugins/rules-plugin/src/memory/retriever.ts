/**
 * Memory Retriever - Hybrid Search with Ranking
 *
 * Combines vector search, FTS, and LIKE fallback with similarity-based
 * ranking, recency/importance boosts, deduplication, and budget control.
 */

import type { MemoryStore, Memory } from "./store.js";
import type { EmbeddingClient } from "./embedder.js";
import { createDebugLog } from "../debug.js";

const debugLog = createDebugLog("[wopal-memory]", "memory");

// Retrieval budget: ranking handles relevance, these control cost
const DEFAULT_LIMIT = 8;
const MAX_RESULTS = 15;

// Minimum similarity threshold (L2 distance → similarity: 1/(1+d))
// 0.35 = floor for same-domain recall (current min ≈ 0.39)
// Cross-domain noise typically falls below 0.30
const MIN_SIMILARITY = 0.35;

// Weibull decay factor (slow decay)
const DECAY_FACTOR = 0.005;

/**
 * Retrieval options
 */
export interface RetrieveOptions {
  limit?: number;
}

/**
 * Memory with computed score for ranking
 */
interface MemoryWithScore extends Memory {
  score: number;
  similarityScore: number;
  recencyScore: number;
  importanceScore: number;
}

/**
 * Memory Retriever - Hybrid search with ranking
 */
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
   * 2. Parallel searches: vector + FTS + LIKE
   * 3. Rank by similarity (primary) + recency/importance (boost)
   * 4. Deduplicate by id
   * 5. Token budget truncation
   * 6. Hard limit on result count
   */
  async retrieve(
    query: string,
    options?: RetrieveOptions
  ): Promise<Memory[]> {
    const limit = options?.limit ?? DEFAULT_LIMIT;

    debugLog(`Retrieving memories for query:\n${query}`);

    const queryVector = this.embedder.toFloat32Array(
      await this.embedder.embedSingle(query)
    );

    const searchPromises = Promise.allSettled([
      this.store.search(queryVector, limit * 3),
      this.store.searchByQuery(query, limit * 3, "fts", ["text"]),
      this.store.searchByQuery(query, limit, "like", ["text"]),
    ]);

    const [vectorResult, ftsResult, likeResult] = await searchPromises;

    const allMemories: Memory[] = [];

    if (vectorResult.status === "fulfilled") {
      allMemories.push(...vectorResult.value);
    }
    if (ftsResult.status === "fulfilled") {
      allMemories.push(...ftsResult.value);
    }
    if (likeResult.status === "fulfilled") {
      allMemories.push(...likeResult.value);
    }

    if (allMemories.length === 0) {
      return [];
    }

    const scoredMemories = this.rankMemories(allMemories);
    const deduplicated = this.deduplicateById(scoredMemories);
    const filtered = deduplicated.filter(m => m.similarityScore >= MIN_SIMILARITY);

    return filtered.slice(0, MAX_RESULTS);
  }

  /**
   * Rank memories using vector similarity as primary signal,
   * with recency and importance as secondary boosts.
   *
   * score = similarity_score + recency_boost + importance_boost
   *
   * similarity_score = 1 / (1 + distance)
   * recency_boost = 0.05 / (1 + decay_factor * hours_since_creation)
   * importance_boost = importance * 0.05
   */
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

  /**
   * Deduplicate memories by id, keeping highest score
   */
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
