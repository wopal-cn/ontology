import { join } from "path";
import { cp, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { parseSource, getOwnerRepo } from "../../lib/source-parser.js";
import { cloneRepo, cleanupTempDir, GitCloneError } from "../../lib/git.js";
import {
  discoverSkills,
  filterSkills,
  getSkillDisplayName,
} from "../../lib/skills.js";
import { writeMetadata, type SkillMetadata } from "../../lib/metadata.js";
import { fetchSkillFolderHash, getGitHubToken } from "../../lib/skill-lock.js";
import type { SubCommandDefinition } from "../../program/types.js";
import { handleCommandError, CommandError } from "../../lib/error-utils.js";

interface ParsedSkillSource {
  owner: string;
  repo: string;
  skill: string;
  originalSource: string;
}

function parseSources(sources: string[]): ParsedSkillSource[] {
  const result: ParsedSkillSource[] = [];

  for (const source of sources) {
    let skillFilter: string | undefined;
    let sourceWithoutSkill = source;

    const atSkillMatch = source.match(/^(.+)@([^/@]+)$/);
    if (atSkillMatch) {
      sourceWithoutSkill = atSkillMatch[1]!;
      skillFilter = atSkillMatch[2]!;
    }

    const parsed = parseSource(sourceWithoutSkill);

    if (parsed.type === "local") {
      throw new CommandError({
        code: "INVALID_SOURCE",
        message:
          "Local paths are not supported by download command.\nUse 'wopal skills install <path>' to install local skills.",
        suggestion: "Use format: owner/repo@skill-name",
      });
    }

    if (!skillFilter) {
      throw new CommandError({
        code: "MISSING_SKILL_NAME",
        message: `Missing skill name in source: ${source}`,
        suggestion:
          "Use format: owner/repo@skill-name\nExample: owner/repo@my-skill",
      });
    }

    const ownerRepo = getOwnerRepo(parsed);

    if (!ownerRepo) {
      throw new CommandError({
        code: "INVALID_SOURCE_FORMAT",
        message: `Invalid source format: ${source}`,
        suggestion: "Use format: owner/repo@skill-name",
      });
    }

    const skillNames = skillFilter.split(",").map((s) => s.trim());

    for (const skill of skillNames) {
      result.push({
        owner: ownerRepo.split("/")[0]!,
        repo: ownerRepo.split("/")[1]!,
        skill,
        originalSource: `${ownerRepo}@${skill}`,
      });
    }
  }

  return result;
}

function groupByRepo(
  sources: ParsedSkillSource[],
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

async function downloadFromRepo(
  repo: string,
  skills: Array<{ skill: string; originalSource: string }>,
  inboxPath: string,
  force: boolean,
  ref: string | undefined,
  context: import("../../program/types.js").ProgramContext,
): Promise<{
  success: string[];
  failed: Array<{ skill: string; error: string }>;
}> {
  const { output, debug } = context;
  const result = {
    success: [] as string[],
    failed: [] as Array<{ skill: string; error: string }>,
  };

  if (debug) {
    output.print(`Parsing source: https://github.com/${repo}`);
  }
  const parsed = parseSource(`https://github.com/${repo}`);
  if (parsed.type === "local") {
    throw new CommandError({
      code: "INVALID_SOURCE",
      message:
        "Local paths are not supported by download command.\nUse 'wopal skills install <path>' to install local skills.",
      suggestion: "Use format: owner/repo@skill-name",
    });
  }

  if (debug) {
    output.print(
      `Source URL: ${parsed.url}, ref: ${ref || parsed.ref || "default"}`,
    );
  }
  let tempDir: string | null = null;
  let commitSha: string | null = null;

  try {
    if (debug) {
      output.print("Cloning repository to temp directory...");
    }
    const cloneResult = await cloneRepo(parsed.url, ref || parsed.ref);
    tempDir = cloneResult.tempDir;
    commitSha = cloneResult.commitSha;
    if (debug) {
      output.print(`Repository cloned to: ${tempDir}, commit: ${commitSha}`);
    }

    if (debug) {
      output.print("Discovering skills in repository...");
    }
    const discoveredSkills = await discoverSkills(tempDir, parsed.subpath, {
      includeInternal: true,
    });
    if (debug) {
      output.print(`Found ${discoveredSkills.length} skills in repository`);
    }

    const skillNames = skills.map((s) => s.skill);
    const targetSkills = filterSkills(discoveredSkills, skillNames);
    if (debug) {
      output.print(
        `Filtered ${targetSkills.length} target skills: ${targetSkills.map((s) => s.name).join(", ")}`,
      );
    }

    const foundSkillNames = new Set(
      targetSkills.map((s) => s.name.toLowerCase()),
    );
    for (const requested of skillNames) {
      if (!foundSkillNames.has(requested.toLowerCase())) {
        const availableSkills = discoveredSkills
          .map((s) => `  - ${getSkillDisplayName(s)}`)
          .join("\n");
        result.failed.push({
          skill: requested,
          error: `Skill '${requested}' not found in repository '${repo}'\nAvailable skills:\n${availableSkills}`,
        });
        if (debug) {
          output.print(`Skill '${requested}' not found in repository`);
        }
      }
    }

    for (const skill of targetSkills) {
      const skillName = skill.name;
      const skillDestPath = join(inboxPath, skillName);

      if (existsSync(skillDestPath) && !force) {
        result.failed.push({
          skill: skillName,
          error: `Skill '${skillName}' already exists in INBOX\nUse --force to overwrite`,
        });
        if (debug) {
          output.print(
            `Skill '${skillName}' already exists in INBOX (use --force to overwrite)`,
          );
        }
        continue;
      }

      if (debug) {
        output.print(
          `Copying skill '${skillName}' from ${skill.path} to ${skillDestPath}`,
        );
      }
      await mkdir(skillDestPath, { recursive: true });
      await cp(skill.path, skillDestPath, { recursive: true });

      const token = getGitHubToken();
      const skillRelativePath = skill.path.replace(tempDir!, "");
      if (debug) {
        output.print(
          `Fetching skill folder hash for ${repo}/${skillRelativePath}`,
        );
      }
      const skillFolderHash = await fetchSkillFolderHash(
        repo,
        skillRelativePath,
        token,
      );

      if (debug) {
        if (skillFolderHash) {
          output.print(`Got skill folder hash: ${skillFolderHash}`);
        } else {
          output.print("Warning: Could not fetch skill folder hash");
        }
      }

      const actualRef = ref || parsed.ref;
      const isTag = actualRef?.match(/^v\d+\.\d+\.\d+/);

      const metadata: SkillMetadata = {
        name: skillName,
        description: skill.description,
        source: `${repo}@${skillName}`,
        sourceUrl: parsed.url,
        skillPath: skillRelativePath,
        downloadedAt: new Date().toISOString(),
        skillFolderHash,
        commit: commitSha!,
        ref: actualRef,
        tag: isTag ? actualRef : undefined,
      };

      if (debug) {
        output.print(`Writing metadata for skill '${skillName}'`);
      }
      await writeMetadata(skillDestPath, metadata);
      result.success.push(skillName);
      if (debug) {
        output.print(`Skill '${skillName}' successfully downloaded`);
      }
    }
  } catch (error) {
    if (debug) {
      output.print(
        `Error during download: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (error instanceof GitCloneError) {
      if (error.isAuthError) {
        throw new CommandError({
          code: "REPO_ACCESS_DENIED",
          message: `Repository '${repo}' not found or access denied`,
          suggestion: "Check repository name and your access permissions",
        });
      }
      throw error;
    }
    throw error;
  } finally {
    if (tempDir) {
      if (debug) {
        output.print(`Cleaning up temp directory: ${tempDir}`);
      }
      await cleanupTempDir(tempDir);
    }
  }

  return result;
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

      const grouped = groupByRepo(parsedSources);
      if (context.debug) {
        output.print(`Grouped into ${grouped.size} repositories`);
      }

      const allResults: Array<{
        success: string[];
        failed: Array<{ skill: string; error: string }>;
      }> = [];

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
        const result = await downloadFromRepo(
          repo,
          skills,
          inboxPath,
          options.force as boolean,
          ref,
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
      "wopal skills download owner/repo@a,b,c    # Download multiple skills",
      "wopal skills download <src> --branch dev  # From specific branch",
      "wopal skills download <src> --tag v1.0.0  # From specific tag",
    ],
    notes: [
      "Source format: owner/repo@skill-name",
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
