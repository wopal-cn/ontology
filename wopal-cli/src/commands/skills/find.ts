import type {
  SubCommandDefinition,
  ProgramContext,
} from "../../program/types.js";
import { handleCommandError } from "../../lib/error-utils.js";

const SEARCH_API_BASE = "https://skills.sh/api/search";
const DEFAULT_LIMIT = 20;
const MAX_API_LIMIT = 100;

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

function getSkillUrl(skill: SkillSearchResult): string {
  return `https://skills.sh/${skill.id}`;
}

async function searchSkills(
  query: string,
  limit: number,
): Promise<SearchAPIResponse> {
  const apiLimit = limit === 0 ? MAX_API_LIMIT : limit;
  const url = `${SEARCH_API_BASE}?q=${encodeURIComponent(query)}&limit=${apiLimit}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as SearchAPIResponse;
  return data;
}

function printResults(
  skills: SkillSearchResult[],
  total: number,
  showing: number,
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
    const displayName = skill.skillId || skill.name;
    output.print(
      `  ${skill.source}@${displayName}  ${formatInstalls(skill.installs)}`,
    );
    output.print(`  └ ${getSkillUrl(skill)}`);
    output.println();
  }

  output.print("Download with: wopal skills download <source>");
}

function printJson(
  skills: SkillSearchResult[],
  query: string,
  total: number,
  showing: number,
  context: ProgramContext,
): void {
  const { output } = context;

  const formattedSkills = skills.map((skill) => ({
    id: skill.id,
    name: skill.skillId || skill.name,
    source: skill.source,
    installs: skill.installs,
    url: getSkillUrl(skill),
  }));

  output.json({
    query,
    total,
    showing,
    skills: formattedSkills,
  });
}

async function runFind(
  query: string,
  limit: number | undefined,
  jsonOutput: boolean,
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

    let skills = data.skills;
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

    if (jsonOutput) {
      printJson(skills, query, total, showing, context);
    } else {
      printResults(skills, total, showing, context);
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
      };

      if (!query || query.trim() === "") {
        context.output.error("Query is required");
        process.exit(1);
      }

      await runFind(
        query,
        findOptions.limit,
        findOptions.json ?? false,
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
      "wopal skills find openspec --limit 50  # Show 50 results",
      "wopal skills find openspec --json      # JSON output",
    ],
    notes: [
      "Results sorted by install count (descending)",
      'Wildcards (*) must be quoted in zsh/bash to prevent glob expansion',
      "Wildcard queries show all matches by default (no limit)",
      "Requires network connection",
    ],
  },
};
