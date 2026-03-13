import type {
  SubCommandDefinition,
  ProgramContext,
} from "../../program/types.js";
import { handleCommandError } from "../../lib/error-utils.js";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import pLimit from "p-limit";
import {
  downloadParsedSourceToInbox,
  parseDownloadSource,
} from "../../lib/download-skill.js";

const SEARCH_API_BASE = "https://skills.sh/api/search";
const DEFAULT_LIMIT = 20;
const MAX_API_LIMIT = 100;
const SEARCH_TIMEOUT_MS = 10000;

interface SkillSearchResult {
  id: string;
  skillId?: string;
  name: string;
  installs: number;
  source: string;
}

interface SearchAPIResponse {
  query: string;
  searchType: string;
  skills: SkillSearchResult[];
  count: number;
  duration_ms?: number;
}

interface FindOptions {
  limit?: number;
  json?: boolean;
  verify?: boolean;
}

interface SkillVerification {
  verified: boolean;
  reason?: string;
}

interface FindResultSkill extends SkillSearchResult {
  verification?: SkillVerification;
}

interface ParsedWildcardQuery {
  apiQuery: string;
  pattern: RegExp | null;
  hasWildcard: boolean;
}

function parseWildcardQuery(query: string): ParsedWildcardQuery {
  if (!query.includes("*")) {
    return { apiQuery: query, pattern: null, hasWildcard: false };
  }

  const escaped = query
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const pattern = new RegExp(`^${escaped}$`, "i");

  const apiQuery = query.split("*")[0] || query.replace(/\*/g, "");

  return { apiQuery, pattern, hasWildcard: true };
}

function matchWildcard(skill: SkillSearchResult, pattern: RegExp): boolean {
  const name = skill.skillId || skill.name;
  const fullName = `${skill.source}/${name}`;
  return pattern.test(name) || pattern.test(fullName);
}

function formatInstalls(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M installs`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K installs`;
  }
  return `${count} installs`;
}

function getDisplayName(skill: SkillSearchResult): string {
  return skill.skillId || skill.name;
}

function getDownloadSource(skill: SkillSearchResult): string {
  return `${skill.source}@${getDisplayName(skill)}`;
}

function summarizeVerificationReason(message: string): string {
  const firstLine =
    message
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) || "Verification failed";

  if (firstLine.length <= 120) {
    return firstLine;
  }

  return `${firstLine.slice(0, 117)}...`;
}

export async function verifySkills(
  skills: SkillSearchResult[],
  context: ProgramContext,
): Promise<FindResultSkill[]> {
  const limit = pLimit(4);

  return Promise.all(
    skills.map((skill) =>
      limit(async () => {
        const parsedSource = parseDownloadSource(getDownloadSource(skill));

        if (!parsedSource) {
          return {
            ...skill,
            verification: {
              verified: false,
              reason: "Source format is not currently downloadable",
            },
          } satisfies FindResultSkill;
        }

        const tempInbox = await mkdtemp(join(tmpdir(), "wopal-find-verify-"));

        try {
          const result = await downloadParsedSourceToInbox(
            parsedSource,
            tempInbox,
            { force: true },
            context,
          );

          if (result.success.length > 0) {
            return {
              ...skill,
              verification: { verified: true },
            } satisfies FindResultSkill;
          }

          return {
            ...skill,
            verification: {
              verified: false,
              reason: summarizeVerificationReason(
                result.failed[0]?.error || "Verification failed",
              ),
            },
          } satisfies FindResultSkill;
        } catch (error) {
          return {
            ...skill,
            verification: {
              verified: false,
              reason: summarizeVerificationReason(
                error instanceof Error ? error.message : String(error),
              ),
            },
          } satisfies FindResultSkill;
        } finally {
          await rm(tempInbox, { recursive: true, force: true });
        }
      }),
    ),
  );
}

function getSkillUrl(skill: SkillSearchResult): string {
  return `https://skills.sh/${skill.id}`;
}

async function searchSkills(
  query: string,
  limit: number,
): Promise<SearchAPIResponse> {
  const apiBase = process.env.WOPAL_SKILLS_SEARCH_API_BASE || SEARCH_API_BASE;
  const apiLimit = limit === 0 ? MAX_API_LIMIT : limit;
  const url = `${apiBase}?q=${encodeURIComponent(query)}&limit=${apiLimit}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Search request timed out after ${SEARCH_TIMEOUT_MS / 1000} seconds`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as SearchAPIResponse;
  return data;
}

function printResults(
  skills: FindResultSkill[],
  total: number,
  showing: number,
  verify: boolean,
  context: ProgramContext,
): void {
  const { output } = context;

  if (skills.length === 0) {
    output.print("No skills found");
    return;
  }

  output.print(`Found ${total} skill(s), showing ${showing}:`);
  output.println();

  for (const skill of skills) {
    const verificationSuffix = verify
      ? skill.verification?.verified
        ? "  [verified]"
        : "  [unverified]"
      : "";
    output.print(
      `  ${getDownloadSource(skill)}  ${formatInstalls(skill.installs)}${verificationSuffix}`,
    );
    output.print(`  └ ${getSkillUrl(skill)}`);
    if (verify && skill.verification?.reason) {
      output.print(`    Reason: ${skill.verification.reason}`);
    }
    output.println();
  }

  if (verify) {
    const verifiedCount = skills.filter(
      (skill) => skill.verification?.verified,
    ).length;
    output.print(
      `Verified ${verifiedCount}/${skills.length} result(s) as downloadable.`,
    );
  } else {
    output.print(
      "Results are indexed from skills.sh and may be stale; use --verify to confirm downloadability.",
    );
  }
  output.println();
  output.print("Download with: wopal skills download <source>");
}

function printJson(
  skills: FindResultSkill[],
  query: string,
  total: number,
  showing: number,
  verify: boolean,
  context: ProgramContext,
): void {
  const { output } = context;

  const formattedSkills = skills.map((skill) => ({
    id: skill.id,
    name: getDisplayName(skill),
    source: skill.source,
    downloadSource: getDownloadSource(skill),
    installs: skill.installs,
    url: getSkillUrl(skill),
    verified: verify ? (skill.verification?.verified ?? false) : undefined,
    verificationReason: verify
      ? (skill.verification?.reason ?? null)
      : undefined,
  }));

  output.json({
    query,
    total,
    showing,
    verified: verify,
    skills: formattedSkills,
  });
}

async function runFind(
  query: string,
  limit: number | undefined,
  jsonOutput: boolean,
  verify: boolean,
  context: ProgramContext,
): Promise<void> {
  const { output } = context;

  try {
    const parsed = parseWildcardQuery(query);
    const effectiveLimit = limit ?? DEFAULT_LIMIT;

    const apiLimit = parsed.hasWildcard
      ? MAX_API_LIMIT
      : limit === 0
        ? MAX_API_LIMIT
        : effectiveLimit;

    const data = await searchSkills(parsed.apiQuery, apiLimit);

    let skills: FindResultSkill[] = data.skills;
    if (parsed.hasWildcard && parsed.pattern) {
      skills = skills.filter((s) => matchWildcard(s, parsed.pattern!));
    }

    if (parsed.hasWildcard) {
      if (limit !== undefined && limit !== 0) {
        skills = skills.slice(0, limit);
      }
    } else if (limit !== 0) {
      skills = skills.slice(0, effectiveLimit);
    }
    const showing = skills.length;
    const total = parsed.hasWildcard ? skills.length : data.count;

    if (verify && skills.length > 0) {
      if (!jsonOutput) {
        output.print(`Verifying ${skills.length} result(s)...`);
      }
      skills = await verifySkills(skills, context);
    }

    if (jsonOutput) {
      printJson(skills, query, total, showing, verify, context);
    } else {
      printResults(skills, total, showing, verify, context);
    }
  } catch (error) {
    if (jsonOutput) {
      const message = error instanceof Error ? error.message : "Unknown error";
      output.jsonError("SEARCH_FAILED", message);
    } else {
      const message = error instanceof Error ? error.message : "Unknown error";
      output.error(message, "Check your network connection and try again");
    }
    process.exit(1);
  }
}

export const findSubcommand: SubCommandDefinition = {
  name: "find <query>",
  description: "Search for skills on skills.sh",
  options: [
    {
      flags: "--limit <number>",
      description: `Max results (default: 20, wildcard: all, 0 = all up to ${MAX_API_LIMIT})`,
    },
    {
      flags: "--verify",
      description: "Verify each result by attempting a temporary download",
    },
    { flags: "--json", description: "Output in JSON format" },
  ],
  action: async (args, options, context) => {
    try {
      const query = args.arg0 as string;
      const findOptions: FindOptions = {
        limit:
          options.limit !== undefined
            ? parseInt(options.limit as string, 10)
            : undefined,
        json: options.json as boolean | undefined,
        verify: options.verify as boolean | undefined,
      };

      if (!query || query.trim() === "") {
        context.output.error("Query is required");
        process.exit(1);
      }

      await runFind(
        query,
        findOptions.limit,
        findOptions.json ?? false,
        findOptions.verify ?? false,
        context,
      );
    } catch (error) {
      handleCommandError(error);
    }
  },
  helpText: {
    examples: [
      "wopal skills find openspec             # Search openspec skills",
      'wopal skills find "openspec*cn"        # Wildcard: quote * in zsh/bash',
      "wopal skills find openspec --verify    # Verify results are downloadable",
      "wopal skills find openspec --limit 50  # Show 50 results",
      "wopal skills find openspec --json      # JSON output",
    ],
    notes: [
      "Results sorted by install count (descending)",
      "Search results come from skills.sh index and may be stale unless verified",
      "Wildcards (*) must be quoted in zsh/bash to prevent glob expansion",
      "Wildcard queries show all matches by default (no limit)",
      "Requires network connection",
    ],
  },
};
