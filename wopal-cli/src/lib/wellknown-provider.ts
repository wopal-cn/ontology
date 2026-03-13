import matter from "gray-matter";
import type {
  WellKnownIndex,
  WellKnownSkill,
  WellKnownSkillEntry,
} from "./types.js";

const WELL_KNOWN_SKILLS_PATH = "/.well-known/skills";
const INDEX_FILE = "index.json";
const FETCH_TIMEOUT_MS = 10000;

interface WellKnownSourceCandidate {
  sourceId: string;
  baseUrl: string;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "wopal-cli",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function parseWellKnownIndex(input: unknown): WellKnownIndex | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const skills = (input as { skills?: unknown }).skills;
  if (!Array.isArray(skills)) {
    return null;
  }

  const normalized: WellKnownSkillEntry[] = [];
  for (const item of skills) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const name = (item as { name?: unknown }).name;
    if (typeof name !== "string" || name.trim() === "") {
      continue;
    }

    const description = (item as { description?: unknown }).description;
    const files = (item as { files?: unknown }).files;
    normalized.push({
      name: name.trim(),
      description: typeof description === "string" ? description : undefined,
      files: Array.isArray(files)
        ? files.filter((f): f is string => typeof f === "string")
        : undefined,
    });
  }

  return { skills: normalized };
}

function isSafeRelativePath(filePath: string): boolean {
  if (!filePath || filePath.includes("\0")) {
    return false;
  }

  if (
    filePath.startsWith("/") ||
    filePath.startsWith("\\") ||
    /^[a-zA-Z]:[/\\]/.test(filePath)
  ) {
    return false;
  }

  const normalized = filePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return !segments.includes("..");
}

function buildSourceCandidates(source: string): WellKnownSourceCandidate[] {
  const trimmed = source.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      return [{ sourceId: parsed.host, baseUrl: parsed.origin }];
    } catch {
      return [];
    }
  }

  const normalized = trimmed.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!normalized) {
    return [];
  }

  return [
    { sourceId: normalized, baseUrl: `https://${normalized}` },
    { sourceId: normalized, baseUrl: `http://${normalized}` },
  ];
}

export async function fetchWellKnownIndex(source: string): Promise<{
  index: WellKnownIndex;
  baseUrl: string;
  sourceId: string;
} | null> {
  const candidates = buildSourceCandidates(source);

  for (const candidate of candidates) {
    try {
      const indexUrl = `${candidate.baseUrl}${WELL_KNOWN_SKILLS_PATH}/${INDEX_FILE}`;
      const response = await fetchWithTimeout(indexUrl);

      if (!response.ok) {
        continue;
      }

      const raw = await response.json();
      const index = parseWellKnownIndex(raw);
      if (!index) {
        continue;
      }

      return {
        index,
        baseUrl: candidate.baseUrl,
        sourceId: candidate.sourceId,
      };
    } catch {
      continue;
    }
  }

  return null;
}

export async function fetchWellKnownSkill(
  baseUrl: string,
  skillName: string,
  entry: WellKnownSkillEntry,
): Promise<WellKnownSkill | null> {
  try {
    const encodedSkillName = encodeURIComponent(skillName);
    const skillBaseUrl = `${baseUrl}${WELL_KNOWN_SKILLS_PATH}/${encodedSkillName}`;
    const skillMdUrl = `${skillBaseUrl}/SKILL.md`;

    const skillResponse = await fetchWithTimeout(skillMdUrl);
    if (!skillResponse.ok) {
      return null;
    }

    const rawSkillMd = await skillResponse.text();
    const { data } = matter(rawSkillMd);

    const frontmatterName =
      typeof data.name === "string" && data.name.trim().length > 0
        ? data.name.trim()
        : entry.name;
    const frontmatterDescription =
      typeof data.description === "string" && data.description.trim().length > 0
        ? data.description.trim()
        : entry.description;

    if (!frontmatterName || !frontmatterDescription) {
      return null;
    }

    const files = new Map<string, string>();
    files.set("SKILL.md", rawSkillMd);

    const otherFiles = (entry.files ?? []).filter(
      (filePath) => filePath.toLowerCase() !== "skill.md",
    );

    await Promise.all(
      otherFiles.map(async (filePath) => {
        if (!isSafeRelativePath(filePath)) {
          return;
        }

        try {
          const fileUrl = new URL(filePath, `${skillBaseUrl}/`).toString();
          const fileResponse = await fetchWithTimeout(fileUrl);
          if (!fileResponse.ok) {
            return;
          }
          files.set(filePath, await fileResponse.text());
        } catch {
          return;
        }
      }),
    );

    return {
      name: frontmatterName,
      description: frontmatterDescription,
      files,
      sourceUrl: skillMdUrl,
    };
  } catch {
    return null;
  }
}
