/**
 * Import MEMORY.md into LanceDB
 *
 * Parses MEMORY.md sections into structured memories,
 * embeds them, and writes to LanceDB via MemoryStore + EmbeddingClient.
 *
 * Usage: npx tsx import-memory-md.ts [--dry-run] [--delete-stale]
 */

import { MemoryStore } from "./src/memory/store.js";
import { EmbeddingClient } from "./src/memory/embedder.js";
import type { MemoryCategory } from "./src/memory/store.js";
import { readFileSync } from "fs";
import { resolve } from "path";

const MEMORY_MD_PATH = resolve(
  import.meta.dirname ?? ".",
  "../../../../../../MEMORY.md"
);

const STALE_IDS = [
  "37277cc4-8f62-4454-ad21-ca4eb45130ca",
  "6f9ec852-8aea-4940-95b5-f5d03a4e814d",
  "678b8bff-004d-42b6-93ef-8f3854806d87",
];

interface ParsedEntry {
  section: string;
  category: MemoryCategory;
  abstract: string;
  overview: string;
  content: string;
  tags: string[];
}

const SECTION_TO_CATEGORY: Record<string, MemoryCategory> = {
  "Wopal-Fae 协作": "patterns",
  "经验": "patterns",
  "知识": "entities",
  "上下文感知": "patterns",
  "教训": "cases",
  "决策": "events",
  "dev-flow 验证结论（2026-03-23）": "cases",
  "OpenSpace 技能进化研究": "entities",
};

const SECTION_TO_TAGS: Record<string, string[]> = {
  "Wopal-Fae 协作": ["collaboration", "pattern"],
  "经验": ["pattern", "workflow"],
  "知识": ["how-it-works", "reference"],
  "上下文感知": ["gotcha"],
  "教训": ["gotcha", "problem-solution"],
  "决策": ["trade-off"],
  "dev-flow 验证结论（2026-03-23）": ["pattern", "what-changed"],
  "OpenSpace 技能进化研究": ["how-it-works"],
};

function parseMemoryMd(content: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const lines = content.split("\n");

  let currentSection = "";
  let blockLines: string[] = [];

  function flushBlock() {
    if (!currentSection || blockLines.length === 0) return;

    const text = blockLines.join("\n").trim();
    if (!text) return;

    const category = SECTION_TO_CATEGORY[currentSection] ?? "entities";
    const tags = SECTION_TO_TAGS[currentSection] ?? [];

    // For multi-paragraph blocks (like Wopal-Fae 协作), treat as single entry
    const firstLine = text.split("\n")[0].replace(/^\*\*.*?\*\*[:：]\s*/, "").trim();
    const abstract = firstLine.length > 100 ? firstLine.slice(0, 100) + "..." : firstLine;

    entries.push({
      section: currentSection,
      category,
      abstract,
      overview: `## ${currentSection}\n${text.split("\n").slice(0, 6).join("\n")}`,
      content: text,
      tags,
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect H3 sections
    if (line.startsWith("### ")) {
      flushBlock();
      currentSection = line.replace("### ", "").trim();
      blockLines = [];
      continue;
    }

    // Skip H1, H2, empty separators, and meta lines
    if (
      line.startsWith("# ") ||
      line.startsWith("## ") ||
      line.trim() === "---" ||
      line.trim() === "" ||
      line.includes("*(此文件由")
    ) {
      // For bullet items within a section, each top-level bullet is an entry
      continue;
    }

    // Top-level bullet item: start new entry
    if (line.match(/^- \*\*/) && currentSection) {
      flushBlock();
      blockLines = [line];
      continue;
    }

    // Sub-items or continuation lines
    if (line.startsWith("  ") || line.startsWith("- ") || line.startsWith("**")) {
      blockLines.push(line);
      continue;
    }

    // Regular text line
    blockLines.push(line);
  }

  flushBlock();
  return entries;
}

function parseMemoryMdSmart(content: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const lines = content.split("\n");

  let currentSection = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect H3 sections
    if (line.startsWith("### ")) {
      currentSection = line.replace("### ", "").trim();
      i++;
      continue;
    }

    // Skip non-content lines
    if (
      line.startsWith("# ") ||
      line.startsWith("## ") ||
      line.trim() === "---" ||
      line.trim() === "" ||
      line.includes("*(此文件由")
    ) {
      i++;
      continue;
    }

    if (!currentSection) {
      i++;
      continue;
    }

    // For structured sections (Wopal-Fae 协作, OpenSpace), collect until next H3
    if (
      currentSection === "Wopal-Fae 协作" ||
      currentSection === "OpenSpace 技能进化研究"
    ) {
      const blockLines: string[] = [];
      // Collect sub-blocks by bold header
      let subBlockLines: string[] = [];
      let subBlockTitle = "";

      while (i < lines.length && !lines[i].startsWith("### ") && lines[i].trim() !== "---") {
        const l = lines[i];
        const boldMatch = l.match(/^\*\*(.+?)\*\*[:：]/);
        if (boldMatch) {
          // Flush previous sub-block
          if (subBlockTitle && subBlockLines.length > 0) {
            const text = subBlockLines.join("\n").trim();
            const category = SECTION_TO_CATEGORY[currentSection] ?? "entities";
            const tags = SECTION_TO_TAGS[currentSection] ?? [];
            entries.push({
              section: currentSection,
              category,
              abstract: `${subBlockTitle}: ${text.split("\n")[0].replace(/^\*\*.*?\*\*[:：]\s*/, "").slice(0, 80)}`,
              overview: `## ${currentSection}\n### ${subBlockTitle}\n${text.split("\n").slice(0, 6).join("\n")}`,
              content: text,
              tags,
            });
          }
          subBlockTitle = boldMatch[1];
          subBlockLines = [l];
        } else if (l.trim()) {
          subBlockLines.push(l);
        }
        i++;
      }
      // Flush last sub-block
      if (subBlockTitle && subBlockLines.length > 0) {
        const text = subBlockLines.join("\n").trim();
        const category = SECTION_TO_CATEGORY[currentSection] ?? "entities";
        const tags = SECTION_TO_TAGS[currentSection] ?? [];
        entries.push({
          section: currentSection,
          category,
          abstract: `${subBlockTitle}: ${text.split("\n")[0].replace(/^\*\*.*?\*\*[:：]\s*/, "").slice(0, 80)}`,
          overview: `## ${currentSection}\n### ${subBlockTitle}\n${text.split("\n").slice(0, 6).join("\n")}`,
          content: text,
          tags,
        });
      }
      continue;
    }

    // For dev-flow 验证结论, collect everything as one block
    if (currentSection.startsWith("dev-flow")) {
      const blockLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("### ") && lines[i].trim() !== "---") {
        if (lines[i].trim()) blockLines.push(lines[i]);
        i++;
      }
      if (blockLines.length > 0) {
        const text = blockLines.join("\n").trim();
        entries.push({
          section: currentSection,
          category: SECTION_TO_CATEGORY[currentSection] ?? "cases",
          abstract: `dev-flow 验证结论: 流程可行，待优化 Appetite/PRD/门控/调查清单`,
          overview: `## ${currentSection}\n${text.split("\n").slice(0, 6).join("\n")}`,
          content: text,
          tags: SECTION_TO_TAGS[currentSection] ?? [],
        });
      }
      continue;
    }

    // For bullet sections (经验/知识/教训/决策/上下文感知): each top-level bullet is an entry
    if (line.startsWith("- ")) {
      const bulletLines: string[] = [line];
      i++;
      // Collect continuation lines (indented or sub-bullets)
      while (
        i < lines.length &&
        !lines[i].startsWith("### ") &&
        lines[i].trim() !== "---" &&
        (lines[i].startsWith("  ") || lines[i].trim() === "")
      ) {
        if (lines[i].trim()) bulletLines.push(lines[i]);
        i++;
      }

      const text = bulletLines.join("\n").trim();
      // Extract bold prefix as abstract key
      const boldMatch = text.match(/^- \*\*(.+?)\*\*[:：]\s*(.*)/s);
      let abstract: string;
      if (boldMatch) {
        const key = boldMatch[1];
        const rest = boldMatch[2].split("\n")[0].trim();
        abstract = `${key}: ${rest}`.slice(0, 120);
      } else {
        abstract = text.replace(/^- /, "").split("\n")[0].slice(0, 120);
      }

      const category = SECTION_TO_CATEGORY[currentSection] ?? "entities";
      const tags = SECTION_TO_TAGS[currentSection] ?? [];

      entries.push({
        section: currentSection,
        category,
        abstract,
        overview: `## ${currentSection}\n${text.split("\n").slice(0, 5).join("\n")}`,
        content: text,
        tags,
      });
      continue;
    }

    // Non-bullet content in section
    i++;
  }

  return entries;
}

function getDefaultImportance(category: MemoryCategory): number {
  switch (category) {
    case "profile": return 0.9;
    case "patterns": return 0.85;
    case "preferences": return 0.8;
    case "cases": return 0.8;
    case "entities": return 0.7;
    case "events": return 0.6;
    default: return 0.5;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const deleteStale = args.includes("--delete-stale");

  console.log(`Reading MEMORY.md from: ${MEMORY_MD_PATH}`);
  const content = readFileSync(MEMORY_MD_PATH, "utf-8");

  const entries = parseMemoryMdSmart(content);
  console.log(`\nParsed ${entries.length} entries from MEMORY.md\n`);

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    console.log(`[${i + 1}] [${e.category}] ${e.abstract}`);
    console.log(`    Section: ${e.section}`);
    console.log(`    Content: ${e.content.slice(0, 100)}...`);
    console.log("");
  }

  if (dryRun) {
    console.log("=== DRY RUN — no writes ===");
    return;
  }

  // Initialize store and embedder
  const store = new MemoryStore();
  await store.init();

  const embedder = new EmbeddingClient();

  // Delete stale memories first
  if (deleteStale) {
    console.log("\n=== Deleting stale memories ===");
    for (const id of STALE_IDS) {
      try {
        await store.delete(id);
        console.log(`  Deleted: ${id}`);
      } catch (error) {
        console.log(`  Failed to delete ${id}: ${error}`);
      }
    }
  }

  // Embed all abstracts in batch
  console.log("\n=== Embedding abstracts ===");
  const abstracts = entries.map((e) => e.abstract);
  const embeddings = await embedder.embed(abstracts);
  console.log(`  Embedded ${embeddings.length} texts, dim=${embeddings[0]?.length ?? 0}`);

  // Write to LanceDB
  console.log("\n=== Writing to LanceDB ===");
  let created = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const vector = embedder.toFloat32Array(embeddings[i]);

    await store.add({
      text: entry.abstract,
      vector,
      category: entry.category,
      project: "wopal-space",
      session_id: "import-memory-md",
      importance: getDefaultImportance(entry.category),
      tags: entry.tags.join(","),
      metadata: {
        overview: entry.overview,
        content: entry.content,
        source: "MEMORY.md",
        section: entry.section,
      },
    });
    created++;
    console.log(`  [${created}] ${entry.category}: ${entry.abstract.slice(0, 60)}`);
  }

  const totalCount = await store.count();
  console.log(`\n=== Done ===`);
  console.log(`  Created: ${created}`);
  console.log(`  Total memories in DB: ${totalCount}`);
}

main().catch(console.error);
