import { parseSource } from "../../lib/source-parser.js";
import {
  downloadFromWellKnown,
  downloadSkillsFromRepo,
  parseDownloadSource,
  type DownloadResult,
} from "../../lib/download-skill.js";
import type { SubCommandDefinition } from "../../program/types.js";
import { handleCommandError, CommandError } from "../../lib/error-utils.js";

interface ParsedGitHubSkillSource {
  type: "github";
  owner: string;
  repo: string;
  skill: string;
  originalSource: string;
}

interface ParsedWellKnownSkillSource {
  type: "well-known";
  source: string;
  skill: string;
  originalSource: string;
}

type ParsedSkillSource = ParsedGitHubSkillSource | ParsedWellKnownSkillSource;

function parseSources(sources: string[]): ParsedSkillSource[] {
  const result: ParsedSkillSource[] = [];

  for (const source of sources) {
    const parsed = parseDownloadSource(source);

    if (!parsed) {
      const atSkillMatch = source.match(/^(.+)@([^/@]+)$/);
      if (atSkillMatch) {
        const sourceWithoutSkill = atSkillMatch[1]!;
        const parsedUrl = parseSource(sourceWithoutSkill);
        if (parsedUrl.type === "local") {
          throw new CommandError({
            code: "INVALID_SOURCE",
            message:
              "Local paths are not supported by download command.\nUse 'wopal skills install <path>' to install local skills.",
            suggestion: "Use format: owner/repo@skill-name",
          });
        }
        throw new CommandError({
          code: "INVALID_SOURCE_FORMAT",
          message: `Invalid source format: ${source}`,
          suggestion:
            "Supported formats:\n" +
            "  - owner/repo@skill-name (GitHub)\n" +
            "  - source@skill-name (well-known)\n" +
            "  - https://skills.sh/<source>/<skill>",
        });
      }

      throw new CommandError({
        code: "MISSING_SKILL_NAME",
        message: `Missing skill name in source: ${source}`,
        suggestion:
          "Use format: owner/repo@skill-name\nExample: owner/repo@my-skill",
      });
    }

    const skillNames = parsed.skill.split(",").map((s) => s.trim());

    for (const skill of skillNames) {
      if (parsed.type === "github") {
        result.push({
          type: "github",
          owner: parsed.owner,
          repo: parsed.repo,
          skill,
          originalSource: `${parsed.owner}/${parsed.repo}@${skill}`,
        });
      } else {
        result.push({
          type: "well-known",
          source: parsed.source,
          skill,
          originalSource: `${parsed.source}@${skill}`,
        });
      }
    }
  }

  return result;
}

function groupByRepo(
  sources: ParsedGitHubSkillSource[],
): Map<string, Array<{ skill: string; originalSource: string }>> {
  const grouped = new Map<
    string,
    Array<{ skill: string; originalSource: string }>
  >();

  for (const source of sources) {
    const key = `${source.owner}/${source.repo}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push({
      skill: source.skill,
      originalSource: source.originalSource,
    });
  }

  return grouped;
}

export const downloadSubcommand: SubCommandDefinition = {
  name: "download <sources...>",
  description:
    "Download skills to INBOX for security scanning before installation",
  options: [
    { flags: "--force", description: "Overwrite existing skills in INBOX" },
    {
      flags: "--branch <branch>",
      description: "Download from specific branch",
    },
    { flags: "--tag <tag>", description: "Download from specific tag" },
  ],
  action: async (args, options, context) => {
    const { output, config } = context;
    try {
      const sources = (args.arg0 as string[]) || [];
      const inboxPath = config.getSkillsInboxDir();

      if (context.debug) {
        output.print(`INBOX directory: ${inboxPath}`);
        output.print(`Parsing sources: ${sources.join(", ")}`);
      }

      const parsedSources = parseSources(sources);
      if (context.debug) {
        output.print(`Parsed ${parsedSources.length} skill sources`);
      }

      const githubSources = parsedSources.filter(
        (source): source is ParsedGitHubSkillSource => source.type === "github",
      );
      const wellKnownSources = parsedSources.filter(
        (source): source is ParsedWellKnownSkillSource =>
          source.type === "well-known",
      );

      const grouped = groupByRepo(githubSources);
      if (context.debug) {
        output.print(
          `Grouped ${githubSources.length} GitHub skill(s) into ${grouped.size} repositories`,
        );
      }

      const allResults: DownloadResult[] = [];

      const ref = (options.tag as string) || (options.branch as string);

      for (const [repo, skills] of grouped.entries()) {
        output.print(
          `Downloading from ${repo}${options.branch ? `@${options.branch}` : ""}${options.tag ? `@${options.tag}` : ""}...`,
        );
        if (context.debug) {
          output.print(
            `Processing repository: ${repo} with ${skills.length} skills`,
          );
        }
        const result = await downloadSkillsFromRepo(
          repo,
          skills,
          inboxPath,
          { force: options.force as boolean, ref },
          context,
        );
        allResults.push(result);
      }

      if (wellKnownSources.length > 0 && ref && context.debug) {
        output.print("Branch/tag options are ignored for well-known sources.");
      }

      for (const source of wellKnownSources) {
        output.print(`Downloading from ${source.source} (well-known)...`);
        const result = await downloadFromWellKnown(
          source.source,
          source.skill,
          inboxPath,
          { force: options.force as boolean },
          context,
        );
        allResults.push(result);
      }

      const totalSuccess = allResults.flatMap((r) => r.success);
      const totalFailed = allResults.flatMap((r) => r.failed);

      if (totalSuccess.length > 0) {
        if (totalSuccess.length === 1) {
          output.print(
            `Downloaded skill '${totalSuccess[0]}' to INBOX${options.force ? " (overwritten)" : ""}`,
          );
        } else {
          output.print(
            `Downloaded ${totalSuccess.length} skills to INBOX${options.force ? " (overwritten)" : ""}`,
          );
        }
      }

      if (totalFailed.length > 0) {
        for (const failure of totalFailed) {
          output.error(`Failed to download '${failure.skill}':`, failure.error);
        }
        process.exit(1);
      }
    } catch (error) {
      handleCommandError(error);
    }
  },
  helpText: {
    examples: [
      "wopal skills download owner/repo@skill    # Download single skill",
      "wopal skills download some.domain@skill   # Download via well-known",
      "wopal skills download https://skills.sh/owner/repo/skill  # Download from skills.sh URL",
      "wopal skills download owner/repo@a,b,c    # Download multiple skills",
      "wopal skills download <src> --branch dev  # From specific branch",
      "wopal skills download <src> --tag v1.0.0  # From specific tag",
    ],
    notes: [
      "Source formats: owner/repo@skill-name, source@skill-name, skills.sh URLs",
      "Skills are downloaded to INBOX for scanning",
      "Use 'wopal skills scan' before installation",
    ],
    workflow: [
      "Find: wopal skills find <keyword>",
      "Download: wopal skills download <source>",
      "Scan: wopal skills scan <skill-name>",
      "Install: wopal skills install <skill-name>",
    ],
  },
};
