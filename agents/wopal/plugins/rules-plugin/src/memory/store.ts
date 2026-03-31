/**
 * LanceDB Memory Storage Layer
 *
 * Manages persistent storage of memory entries with vector search and FTS capabilities.
 */

import * as lancedb from "@lancedb/lancedb";
import { makeArrowTable } from "@lancedb/lancedb";
import { createDebugLog, createWarnLog } from "../debug.js";
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";

const debugLog = createDebugLog("[wopal-memory]", "memory");
const warnLog = createWarnLog("[wopal-memory]");

/**
 * Memory category types
 *
 * Tag names are stored in English; display labels in Chinese.
 * Text body titles MUST start with `## [中文标签]: <description>` to stay consistent.
 */
export type MemoryCategory =
  | "profile"
  | "preference"
  | "knowledge"
  | "fact"
  | "gotcha"
  | "experience"
  | "requirement";

/**
 * Memory entry schema
 *
 * Note: Includes index signature for LanceDB compatibility
 */
export interface Memory {
  id: string;
  text: string;
  vector: Float32Array;
  category: MemoryCategory;
  project: string;
  session_id: string;
  importance: number; // 0-1
  created_at: number; // timestamp ms
  updated_at: number; // timestamp ms
  access_count: number;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Input for creating a new memory
 */
export interface MemoryInput {
  text: string;
  vector: Float32Array;
  category: MemoryCategory;
  project: string;
  session_id: string;
  importance?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Internal row shape written to LanceDB.
 * created_at/updated_at are int64 (bigint), access_count is float.
 */
interface StoredMemoryRow {
  [key: string]: unknown;
  id: string;
  text: string;
  vector: Float32Array;
  category: string;
  project: string;
  session_id: string;
  importance: number;
  created_at: bigint;
  updated_at: bigint;
  access_count: number;
  metadata: string;
}

type MemoryUpdate = Partial<
  Pick<
    Memory,
    | "text"
    | "vector"
    | "category"
    | "project"
    | "session_id"
    | "importance"
    | "access_count"
    | "metadata"
  >
>;

/**
 * Query type for hybrid search
 */
export type QueryType = "vector" | "fts" | "like" | "hybrid";

/**
 * LanceDB connection and table manager
 */
export class MemoryStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private initialized = false;
  private readonly dbPath: string;
  private readonly tableName = "memories";

  constructor(dbPath?: string) {
    this.dbPath =
      dbPath ?? join(homedir(), ".wopal", "memory", "lancedb");
  }

  async init(): Promise<void> {
    try {
      if (!existsSync(this.dbPath)) {
        mkdirSync(this.dbPath, { recursive: true });
        debugLog(`Created memory database directory: ${this.dbPath}`);
      }

      this.db = await lancedb.connect(this.dbPath);
      debugLog(`Connected to LanceDB at: ${this.dbPath}`);

      try {
        this.table = await this.db.openTable(this.tableName);
        debugLog(`Table '${this.tableName}' opened`);
        const schema = await this.table.schema();
        debugLog(
          `Memory schema: ${schema.fields.map((f) => `${f.name}:${f.type}`).join(", ")}`
        );
      } catch {
        const schemaData = makeArrowTable([
          {
            id: "",
            text: "",
            vector: new Float32Array(768),
            category: "",
            project: "",
            session_id: "",
            importance: 0.0,
            created_at: BigInt(0),
            updated_at: BigInt(0),
            access_count: 0,
            metadata: "{}",
          },
        ]);
        this.table = await this.db.createTable(this.tableName, schemaData);
        await this.table.delete("id = ''");
        debugLog(`Table '${this.tableName}' created with schema`);
      }

      await this.table.createIndex("text", {
        config: lancedb.Index.fts(),
      });
      debugLog(`FTS index created on 'text' column`);

      this.initialized = true;
      debugLog(`MemoryStore initialized successfully`);
    } catch (error) {
      warnLog(`MemoryStore init failed, gracefully degrading: ${error}`);
      this.initialized = false;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Convert a Memory (JS number timestamps) to a StoredMemoryRow (bigint timestamps).
   * This is the only place we touch bigint — keeping the conversion centralized.
   */
  private toStoredRow(memory: Memory): StoredMemoryRow {
    return {
      id: memory.id,
      text: memory.text,
      vector: new Float32Array(memory.vector),
      category: memory.category,
      project: memory.project,
      session_id: memory.session_id,
      importance: memory.importance,
      created_at: BigInt(memory.created_at),
      updated_at: BigInt(memory.updated_at),
      access_count: memory.access_count,
      metadata: JSON.stringify(memory.metadata ?? {}),
    };
  }

  /**
   * Convert raw Arrow StructRows back to plain Memory objects.
   * Must spread first to detach from Arrow setters (which reject Number on int64 columns).
   */
  private parseMemories(rows: unknown[]): Memory[] {
    return rows.map((row) => {
      const r = { ...(row as Record<string, unknown>) };

      if (typeof r.metadata === "string") {
        try {
          r.metadata = JSON.parse(r.metadata);
        } catch {
          r.metadata = {};
        }
      } else if (r.metadata == null) {
        r.metadata = {};
      }

      if (typeof r.created_at === "bigint") r.created_at = Number(r.created_at);
      if (typeof r.updated_at === "bigint") r.updated_at = Number(r.updated_at);
      if (typeof r.access_count === "bigint") r.access_count = Number(r.access_count);

      return r as Memory;
    });
  }

  async add(input: MemoryInput): Promise<Memory> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    const body = input.text?.trim();
    if (!body || body.length < 20) {
      throw new Error(
        `Memory body must be non-empty and at least 20 characters (got ${body?.length ?? 0})`
      );
    }

    const now = Date.now();
    const memory: Memory = {
      id: randomUUID(),
      text: input.text,
      vector: input.vector,
      category: input.category,
      project: input.project,
      session_id: input.session_id,
      importance: input.importance ?? 0.5,
      created_at: now,
      updated_at: now,
      access_count: 0,
      metadata: input.metadata ?? {},
    };

    await this.table.add([this.toStoredRow(memory)]);
    debugLog(`Added memory: ${memory.id} (${memory.category})`);

    return memory;
  }

  async search(vector: Float32Array, limit: number = 10): Promise<Memory[]> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    await this.table.checkoutLatest();

    const results = await this.table
      .vectorSearch(vector)
      .limit(limit)
      .toArray();

    return this.parseMemories(results);
  }

  async searchByQuery(
    query: string,
    limit: number = 10,
    queryType: QueryType = "hybrid",
    ftsColumns: string[] = ["text"]
  ): Promise<Memory[]> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    await this.table.checkoutLatest();

    switch (queryType) {
      case "fts": {
        const results = this.parseMemories(
          await this.table
            .query()
            .fullTextSearch(query, { columns: ftsColumns })
            .limit(limit)
            .toArray()
        );
        return results;
      }

      case "like": {
        const results = this.parseMemories(
          await this.table
            .query()
            .where(`text LIKE '%${query.replace(/'/g, "''")}%'`)
            .limit(limit)
            .toArray()
        );
        return results;
      }

      case "hybrid": {
        const ftsResults = this.parseMemories(
          await this.table
            .query()
            .fullTextSearch(query, { columns: ftsColumns })
            .limit(limit)
            .toArray()
        );

        const likeResults = this.parseMemories(
          await this.table
            .query()
            .where(`text LIKE '%${query.replace(/'/g, "''")}%'`)
            .limit(limit)
            .toArray()
        );

        const seen = new Set<string>();
        const results: Memory[] = [];
        for (const memory of [...ftsResults, ...likeResults]) {
          if (!seen.has(memory.id)) {
            seen.add(memory.id);
            results.push(memory);
          }
        }
        const limited = results.slice(0, limit);
        return limited;
      }

      default:
        throw new Error(`Unknown query type: ${queryType}`);
    }
  }

  async update(id: string, values: MemoryUpdate): Promise<void> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    const existing = await this.table
      .query()
      .where(`id = '${id}'`)
      .toArray();

    if (existing.length === 0) {
      debugLog(`Memory not found for update: ${id}`);
      return;
    }

    const memory = this.parseMemories(existing)[0];
    const updated: Memory = {
      ...memory,
      ...values,
      id,
      created_at: memory.created_at,
      updated_at: Date.now(),
      access_count: values.access_count ?? memory.access_count,
      metadata: (values.metadata as Record<string, unknown> | undefined) ?? (memory.metadata as Record<string, unknown>) ?? {},
    };

    await this.table.delete(`id = '${id}'`);
    await this.table.add([this.toStoredRow(updated)]);
    debugLog(`Updated memory: ${id}`);
  }

  async delete(id: string): Promise<void> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    await this.table.delete(`id = '${id}'`);
    debugLog(`Deleted memory: ${id}`);
  }

  async count(): Promise<number> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    return this.table.countRows();
  }

  async get(id: string): Promise<Memory | null> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    const results = await this.table
      .query()
      .where(`id = '${id}'`)
      .toArray();

    const parsed = this.parseMemories(results);
    return parsed.length > 0 ? parsed[0] : null;
  }

  async getBySession(sessionId: string): Promise<Memory[]> {
    if (!this.initialized || !this.table) {
      throw new Error("MemoryStore not initialized");
    }

    const results = await this.table
      .query()
      .where(`session_id = '${sessionId}'`)
      .toArray();

    return this.parseMemories(results);
  }
}
