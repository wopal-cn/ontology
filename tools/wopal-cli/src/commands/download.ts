import { Command } from "commander";
import { join, basename } from "path";
import { cp, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { parseSource, getOwnerRepo } from "../utils/source-parser.js";
import { cloneRepo, cleanupTempDir, GitCloneError } from "../utils/git.js";
import {
  discoverSkills,
  filterSkills,
  getSkillDisplayName,
} from "../utils/skills.js";
import { writeMetadata, type SkillMetadata } from "../utils/metadata.js";
import { fetchSkillFolderHash, getGitHubToken } from "../utils/skill-lock.js";
import { Logger } from "../utils/logger.js";
import { getConfig } from "../utils/config.js";
import { buildHelpText } from "../utils/help-texts.js";

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

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
      throw new Error(
        "Local paths are not supported by download command.\nUse 'wopal skills install <path>' to install local skills.",
      );
    }

    if (!skillFilter) {
      throw new Error(
        `Missing skill name in source: ${source}\nUse format: owner/repo@skill-name\nExample: owner/repo@my-skill`,
      );
    }

    const ownerRepo = getOwnerRepo(parsed);

    if (!ownerRepo) {
      throw new Error(
        `Invalid source format: ${source}\nUse format: owner/repo@skill-name`,
      );
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
  ref?: string,
): Promise<{
  success: string[];
  failed: Array<{ skill: string; error: string }>;
}> {
  const result = {
    success: [] as string[],
    failed: [] as Array<{ skill: string; error: string }>,
  };

  logger?.log(`Parsing source: https://github.com/${repo}`);
  const parsed = parseSource(`https://github.com/${repo}`);
  if (parsed.type === "local") {
    throw new Error(
      "Local paths are not supported by download command.\nUse 'wopal skills install <path>' to install local skills.",
    );
  }

  logger?.log(
    `Source URL: ${parsed.url}, ref: ${ref || parsed.ref || "default"}`,
  );
  let tempDir: string | null = null;
  let commitSha: string | null = null;

  try {
    logger?.log(`Cloning repository to temp directory...`);
    const cloneResult = await cloneRepo(parsed.url, ref || parsed.ref);
    tempDir = cloneResult.tempDir;
    commitSha = cloneResult.commitSha;
    logger?.log(`Repository cloned to: ${tempDir}, commit: ${commitSha}`);

    logger?.log(`Discovering skills in repository...`);
    const discoveredSkills = await discoverSkills(tempDir, parsed.subpath, {
      includeInternal: true,
    });
    logger?.log(`Found ${discoveredSkills.length} skills in repository`);

    const skillNames = skills.map((s) => s.skill);
    const targetSkills = filterSkills(discoveredSkills, skillNames);
    logger?.log(
      `Filtered ${targetSkills.length} target skills: ${targetSkills.map((s) => s.name).join(", ")}`,
    );

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
        logger?.log(`Skill '${requested}' not found in repository`);
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
        logger?.log(
          `Skill '${skillName}' already exists in INBOX (use --force to overwrite)`,
        );
        continue;
      }

      logger?.log(
        `Copying skill '${skillName}' from ${skill.path} to ${skillDestPath}`,
      );
      await mkdir(skillDestPath, { recursive: true });
      await cp(skill.path, skillDestPath, { recursive: true });

      const token = getGitHubToken();
      const skillRelativePath = skill.path.replace(tempDir!, "");
      logger?.log(
        `Fetching skill folder hash for ${repo}/${skillRelativePath}`,
      );
      const skillFolderHash = await fetchSkillFolderHash(
        repo,
        skillRelativePath,
        token,
      );

      if (skillFolderHash) {
        logger?.log(`Got skill folder hash: ${skillFolderHash}`);
      } else {
        logger?.log(`Warning: Could not fetch skill folder hash`);
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

      logger?.log(`Writing metadata for skill '${skillName}'`);
      await writeMetadata(skillDestPath, metadata);
      result.success.push(skillName);
      logger?.log(`Skill '${skillName}' successfully downloaded`);
    }
  } catch (error) {
    logger?.log(
      `Error during download: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (error instanceof GitCloneError) {
      if (error.isAuthError) {
        throw new Error(
          `Repository '${repo}' not found or access denied\nCheck repository name and your access permissions`,
        );
      }
      throw error;
    }
    throw error;
  } finally {
    if (tempDir) {
      logger?.log(`Cleaning up temp directory: ${tempDir}`);
      await cleanupTempDir(tempDir);
    }
  }

  return result;
}

export function registerDownloadCommand(program: Command) {
  const command = program
    .command("download <sources...>")
    .description(
      "Download skills to INBOX for security scanning before installation",
    )
    .option("--force", "Overwrite existing skills in INBOX")
    .option("--branch <branch>", "Download from specific branch")
    .option("--tag <tag>", "Download from specific tag")
    .action(
      async (
        sources: string[],
        options: { force?: boolean; branch?: string; tag?: string },
      ) => {
        try {
          const inboxPath = getConfig().getSkillInboxDir();
          logger?.log(`INBOX directory: ${inboxPath}`);
          logger?.log(`Parsing sources: ${sources.join(", ")}`);

          const parsedSources = parseSources(sources);
          logger?.log(`Parsed ${parsedSources.length} skill sources`);

          const grouped = groupByRepo(parsedSources);
          logger?.log(`Grouped into ${grouped.size} repositories`);

          const allResults: Array<{
            success: string[];
            failed: Array<{ skill: string; error: string }>;
          }> = [];

          for (const [repo, skills] of grouped.entries()) {
            console.log(
              `Downloading from ${repo}${options.branch ? `@${options.branch}` : ""}${options.tag ? `@${options.tag}` : ""}...`,
            );
            logger?.log(
              `Processing repository: ${repo} with ${skills.length} skills`,
            );
            const ref = options.tag || options.branch;
            const result = await downloadFromRepo(
              repo,
              skills,
              inboxPath,
              options.force || false,
              ref,
            );
            allResults.push(result);
          }

          const totalSuccess = allResults.flatMap((r) => r.success);
          const totalFailed = allResults.flatMap((r) => r.failed);

          if (totalSuccess.length > 0) {
            if (totalSuccess.length === 1) {
              console.log(
                `✓ Downloaded skill '${totalSuccess[0]}' to INBOX${options.force ? " (overwritten)" : ""}`,
              );
            } else {
              console.log(
                `✓ Downloaded ${totalSuccess.length} skills to INBOX${options.force ? " (overwritten)" : ""}`,
              );
            }
          }

          if (totalFailed.length > 0) {
            for (const failure of totalFailed) {
              console.error(`\n✗ Failed to download '${failure.skill}':`);
              console.error(failure.error);
            }
            process.exit(1);
          }
        } catch (error) {
          console.error(
            `\nError: ${error instanceof Error ? error.message : String(error)}`,
          );
          process.exit(1);
        }
      },
    );

  command.addHelpText(
    "after",
    `

SOURCE FORMAT:
  owner/repo@skill-name            Download single skill
  owner/repo@skill1,skill2,...     Download multiple skills from same repo

BATCH DOWNLOAD:
  # Multiple sources (space-separated)
  wopal skills download owner/repo@skill1 owner/repo@skill2

  # Multiple skills from same repo (comma-separated)
  wopal skills download owner/repo@skill1,skill2,skill3

  # Mixed formats
  wopal skills download owner1/repo1@skill1 owner2/repo2@skill2

EXAMPLES:
  # Download single skill (copy from 'wopal skills find' output)
  wopal skills download forztf/open-skilled-sdd@openspec-proposal-creation

  # Download multiple skills from same repository
  wopal skills download forztf/open-skilled-sdd@openspec-proposal-creation,openspec-implementation

  # Download from specific branch
  wopal skills download owner/repo@skill --branch develop

  # Download from specific tag
  wopal skills download owner/repo@skill --tag v1.2.3

  # Download multiple skills from different repositories
  wopal skills download \\
    forztf/open-skilled-sdd@openspec-proposal-creation \\
    itechmeat/llm-code@openspec

OPTIONS:
  --force            Overwrite existing skills in INBOX
  --branch <branch>  Download from specific branch
  --tag <tag>        Download from specific tag
  --help             Show this help message

NOTES:
  - Skills are downloaded to INBOX for security scanning
  - Use 'wopal skills scan <skill-name>' to scan skills in INBOX
  - Use 'wopal skills install <skill-name>' to install scanned skills
  - Local paths are not supported (use 'install' command instead)

WORKFLOW:
  1. Find skills:   wopal skills find <keyword>
  2. Download:      wopal skills download <source>...
  3. Scan:          wopal skills scan <skill-name>
  4. Install:       wopal skills install <skill-name>
`,
  );
}
