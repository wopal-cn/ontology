import { dirname, join, resolve, sep } from "path";
import { cp, mkdir, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { parseSource, getOwnerRepo } from "./source-parser.js";
import {
  cloneRepo,
  cleanupTempDir,
  GitCloneError,
  downloadViaGitHubApi,
  parseGitHubUrl,
} from "./git.js";
import { discoverSkills, filterSkills, getSkillDisplayName } from "./skills.js";
import { writeMetadata, type SkillMetadata } from "./metadata.js";
import { fetchSkillFolderHash, getGitHubToken } from "./skill-lock.js";
import { computeSkillFolderHash } from "./hash.js";
import {
  fetchWellKnownIndex,
  fetchWellKnownSkill,
} from "./wellknown-provider.js";
import type { ProgramContext } from "../program/types.js";
import { CommandError } from "./error-utils.js";

export interface DownloadOptions {
  force: boolean;
  ref?: string;
}

export interface DownloadResult {
  success: string[];
  failed: Array<{ skill: string; error: string }>;
}

export type ParsedDownloadSource =
  | {
      type: "github";
      owner: string;
      repo: string;
      skill: string;
    }
  | {
      type: "well-known";
      source: string;
      skill: string;
    };

function isPathInside(baseDir: string, targetPath: string): boolean {
  const base = resolve(baseDir);
  const target = resolve(targetPath);
  return target === base || target.startsWith(base + sep);
}

export async function downloadSkillToInbox(
  owner: string,
  repo: string,
  skillName: string,
  inboxPath: string,
  options: DownloadOptions,
  context: ProgramContext,
): Promise<DownloadResult> {
  const { output, debug } = context;
  const skillDestPath = join(inboxPath, skillName);

  if (existsSync(skillDestPath)) {
    if (!options.force) {
      return {
        success: [],
        failed: [
          {
            skill: skillName,
            error: `Skill '${skillName}' already exists in INBOX\nUse --force to overwrite`,
          },
        ],
      };
    }
    if (debug) {
      output.print(`Removing existing INBOX skill: ${skillDestPath}`);
    }
    await rm(skillDestPath, { recursive: true, force: true });
  }

  const skillPaths = [`skills/${skillName}`, skillName];
  let lastError: string | null = null;

  for (const skillPath of skillPaths) {
    try {
      if (debug) {
        output.print(`Trying GitHub API: ${owner}/${repo}/${skillPath}`);
      }

      const { tempDir, commitSha } = await downloadViaGitHubApi(
        owner,
        repo,
        skillPath,
        options.ref,
      );

      if (debug) {
        output.print(`Downloaded via API to: ${tempDir}, commit: ${commitSha}`);
      }

      await mkdir(skillDestPath, { recursive: true });
      await cp(tempDir, skillDestPath, { recursive: true });

      const token = getGitHubToken();
      let skillFolderHash = await fetchSkillFolderHash(
        `${owner}/${repo}`,
        `/${skillPath}`,
        token,
      );

      if (!skillFolderHash) {
        skillFolderHash = commitSha;
        if (debug) {
          output.print(
            `Warning: Could not fetch skill folder hash, using commit SHA fallback: ${commitSha}`,
          );
        }
      }

      let description = "";
      try {
        const discovered = await discoverSkills(skillDestPath, undefined, {
          includeInternal: true,
        });
        if (discovered.length > 0) {
          description = discovered[0]!.description;
        }
      } catch {
        // Ignore
      }

      const metadata: SkillMetadata = {
        name: skillName,
        description,
        source: `${owner}/${repo}@${skillName}`,
        sourceUrl: `https://github.com/${owner}/${repo}.git`,
        skillPath: `/${skillPath}`,
        downloadedAt: new Date().toISOString(),
        skillFolderHash,
        commit: commitSha,
        ref: options.ref,
      };

      await writeMetadata(skillDestPath, metadata);
      await cleanupTempDir(tempDir);

      if (debug) {
        output.print(`Skill '${skillName}' downloaded via GitHub API`);
      }

      return { success: [skillName], failed: [] };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (debug) {
        output.print(`API path ${skillPath} failed: ${lastError}`);
      }
    }
  }

  if (debug) {
    output.print(
      `GitHub API download incomplete, falling back to git clone...`,
    );
  }

  return await downloadViaClone(
    `${owner}/${repo}`,
    skillName,
    inboxPath,
    options,
    context,
    lastError,
  );
}

async function downloadViaClone(
  repo: string,
  skillName: string,
  inboxPath: string,
  options: DownloadOptions,
  context: ProgramContext,
  apiLastError: string | null,
): Promise<DownloadResult> {
  const { output, debug } = context;
  const skillDestPath = join(inboxPath, skillName);

  if (existsSync(skillDestPath) && !options.force) {
    return {
      success: [],
      failed: [
        {
          skill: skillName,
          error: `Skill '${skillName}' already exists in INBOX\nUse --force to overwrite`,
        },
      ],
    };
  }
  if (existsSync(skillDestPath) && options.force) {
    if (debug) {
      output.print(`Removing existing INBOX skill: ${skillDestPath}`);
    }
    await rm(skillDestPath, { recursive: true, force: true });
  }

  if (debug) {
    output.print(`Parsing source: https://github.com/${repo}`);
  }
  const parsed = parseSource(`https://github.com/${repo}`);
  if (parsed.type === "local") {
    return {
      success: [],
      failed: [
        {
          skill: skillName,
          error: `Invalid repository format: ${repo}`,
        },
      ],
    };
  }

  if (debug) {
    output.print(
      `Source URL: ${parsed.url}, ref: ${options.ref || parsed.ref || "default"}`,
    );
  }
  let tempDir: string | null = null;
  let commitSha: string | null = null;
  let cloneAttemptErrors: string[] = [];

  try {
    if (debug) {
      output.print("Cloning repository to temp directory...");
    }

    const cloneRef = options.ref || parsed.ref;
    try {
      const cloneResult = await cloneRepo(parsed.url, cloneRef);
      tempDir = cloneResult.tempDir;
      commitSha = cloneResult.commitSha;
    } catch (error) {
      const primaryCloneError =
        error instanceof Error ? error.message : String(error);
      cloneAttemptErrors.push(
        `HTTPS clone failed: ${primaryCloneError.split("\n")[0]}`,
      );

      const githubRepo = parseGitHubUrl(parsed.url);
      const shouldTrySsh = error instanceof GitCloneError && githubRepo;

      if (!shouldTrySsh) {
        throw error;
      }

      const sshUrl = `git@github.com:${githubRepo.owner}/${githubRepo.repo}.git`;
      if (debug) {
        output.print(`HTTPS clone failed, trying SSH clone: ${sshUrl}`);
      }

      const sshCloneResult = await cloneRepo(sshUrl, cloneRef);
      tempDir = sshCloneResult.tempDir;
      commitSha = sshCloneResult.commitSha;
    }

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

    const targetSkills = filterSkills(discoveredSkills, [skillName]);
    if (debug) {
      output.print(
        `Filtered ${targetSkills.length} target skills: ${targetSkills.map((s) => s.name).join(", ")}`,
      );
    }

    const foundSkill = targetSkills.find(
      (s) => s.name.toLowerCase() === skillName.toLowerCase(),
    );

    if (!foundSkill) {
      const availableSkills = discoveredSkills
        .map((s) => `  - ${getSkillDisplayName(s)}`)
        .join("\n");
      return {
        success: [],
        failed: [
          {
            skill: skillName,
            error: `Skill '${skillName}' not found in repository '${repo}'\nAvailable skills:\n${availableSkills}`,
          },
        ],
      };
    }

    if (debug) {
      output.print(
        `Copying skill '${skillName}' from ${foundSkill.path} to ${skillDestPath}`,
      );
    }
    await mkdir(skillDestPath, { recursive: true });
    await cp(foundSkill.path, skillDestPath, { recursive: true });

    const token = getGitHubToken();
    const skillRelativePath = foundSkill.path.replace(tempDir, "");
    if (debug) {
      output.print(
        `Fetching skill folder hash for ${repo}/${skillRelativePath}`,
      );
    }
    let skillFolderHash = await fetchSkillFolderHash(
      repo,
      skillRelativePath,
      token,
    );

    if (!skillFolderHash) {
      skillFolderHash = commitSha;
    }

    if (debug) {
      output.print(`Got skill folder hash: ${skillFolderHash}`);
    }

    const actualRef = options.ref || parsed.ref;
    const isTag = actualRef?.match(/^v\d+\.\d+\.\d+/);

    const metadata: SkillMetadata = {
      name: skillName,
      description: foundSkill.description,
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

    if (debug) {
      output.print(`Skill '${skillName}' successfully downloaded`);
    }

    return { success: [skillName], failed: [] };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (debug) {
      output.print(`Error during download: ${errorMsg}`);
    }

    const details: string[] = [];
    if (apiLastError) {
      details.push(`GitHub API failed: ${apiLastError}`);
    }
    details.push(...cloneAttemptErrors);
    details.push(`Git clone failed: ${errorMsg}`);

    let errorMessage = details.join("\n");
    if (error instanceof GitCloneError && error.isAuthError) {
      errorMessage =
        `Repository '${repo}' not found or access denied via both GitHub API and git clone.` +
        `\nProvide GITHUB_TOKEN/GH_TOKEN for private repos, or ensure your SSH key access is configured.` +
        `\n${details.join("\n")}`;
    }

    return {
      success: [],
      failed: [{ skill: skillName, error: errorMessage }],
    };
  } finally {
    if (tempDir) {
      if (debug) {
        output.print(`Cleaning up temp directory: ${tempDir}`);
      }
      await cleanupTempDir(tempDir);
    }
  }
}

export async function downloadFromWellKnown(
  source: string,
  skillName: string,
  inboxPath: string,
  options: DownloadOptions,
  context: ProgramContext,
): Promise<DownloadResult> {
  const { output, debug } = context;
  const skillDestPath = join(inboxPath, skillName);

  if (existsSync(skillDestPath)) {
    if (!options.force) {
      return {
        success: [],
        failed: [
          {
            skill: skillName,
            error: `Skill '${skillName}' already exists in INBOX\nUse --force to overwrite`,
          },
        ],
      };
    }

    if (debug) {
      output.print(`Removing existing INBOX skill: ${skillDestPath}`);
    }
    await rm(skillDestPath, { recursive: true, force: true });
  }

  if (debug) {
    output.print(`Trying well-known protocol: ${source}`);
  }

  const indexResult = await fetchWellKnownIndex(source);
  if (!indexResult) {
    return {
      success: [],
      failed: [
        {
          skill: skillName,
          error:
            `Source '${source}' is not accessible or does not support well-known protocol.` +
            `\nThis may be a private/internal domain or the skill source no longer exists.` +
            `\nTry: wopal skills find ${skillName}`,
        },
      ],
    };
  }

  const skillEntry = indexResult.index.skills.find(
    (item) => item.name.toLowerCase() === skillName.toLowerCase(),
  );

  if (!skillEntry) {
    const availableSkills = indexResult.index.skills
      .map((item) => `  - ${item.name}`)
      .join("\n");

    return {
      success: [],
      failed: [
        {
          skill: skillName,
          error:
            `Skill '${skillName}' not found at '${source}'.` +
            (availableSkills
              ? `\nAvailable skills:\n${availableSkills}`
              : "\nNo skills listed in index."),
        },
      ],
    };
  }

  if (debug) {
    output.print(
      `Fetching skill '${skillName}' from ${indexResult.baseUrl}/.well-known/skills/...`,
    );
  }

  const skill = await fetchWellKnownSkill(
    indexResult.baseUrl,
    skillName,
    skillEntry,
  );

  if (!skill) {
    return {
      success: [],
      failed: [
        {
          skill: skillName,
          error: `Failed to fetch skill '${skillName}' from '${source}'.`,
        },
      ],
    };
  }

  try {
    await mkdir(skillDestPath, { recursive: true });

    for (const [filePath, content] of skill.files.entries()) {
      const targetPath = resolve(skillDestPath, filePath);
      if (!isPathInside(skillDestPath, targetPath)) {
        continue;
      }

      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, content, "utf-8");
    }

    const skillFolderHash = await computeSkillFolderHash(skillDestPath);

    const metadata: SkillMetadata = {
      name: skillName,
      description: skill.description,
      source: `${indexResult.sourceId}@${skillName}`,
      sourceUrl: indexResult.baseUrl,
      skillPath: `/.well-known/skills/${skillName}`,
      downloadedAt: new Date().toISOString(),
      skillFolderHash,
    };

    await writeMetadata(skillDestPath, metadata);

    if (debug) {
      output.print(`Skill '${skillName}' downloaded via well-known protocol`);
    }

    return { success: [skillName], failed: [] };
  } catch (error) {
    await rm(skillDestPath, { recursive: true, force: true });
    return {
      success: [],
      failed: [
        {
          skill: skillName,
          error:
            error instanceof Error
              ? error.message
              : `Failed to download skill '${skillName}' from '${source}'.`,
        },
      ],
    };
  }
}

export async function downloadParsedSourceToInbox(
  source: ParsedDownloadSource,
  inboxPath: string,
  options: DownloadOptions,
  context: ProgramContext,
): Promise<DownloadResult> {
  if (source.type === "github") {
    return downloadSkillToInbox(
      source.owner,
      source.repo,
      source.skill,
      inboxPath,
      options,
      context,
    );
  }

  return downloadFromWellKnown(
    source.source,
    source.skill,
    inboxPath,
    options,
    context,
  );
}

export async function downloadSkillsFromRepo(
  repo: string,
  skills: Array<{ skill: string; originalSource: string }>,
  inboxPath: string,
  options: DownloadOptions,
  context: ProgramContext,
): Promise<DownloadResult> {
  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    throw new CommandError({
      code: "INVALID_SOURCE",
      message: `Invalid repository format: ${repo}`,
      suggestion: "Use format: owner/repo@skill-name",
    });
  }

  const result: DownloadResult = {
    success: [],
    failed: [],
  };

  for (const { skill: skillName } of skills) {
    const skillResult = await downloadSkillToInbox(
      owner,
      repoName,
      skillName,
      inboxPath,
      options,
      context,
    );
    result.success.push(...skillResult.success);
    result.failed.push(...skillResult.failed);
  }

  return result;
}

function parseFromSkillsShUrl(input: string): {
  source: string;
  skill: string;
} | null {
  try {
    const parsedUrl = new URL(input);
    if (parsedUrl.hostname !== "skills.sh") {
      return null;
    }

    const cleanPath = decodeURIComponent(parsedUrl.pathname)
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    if (!cleanPath) {
      return null;
    }

    const atSkillMatch = cleanPath.match(/^(.+)@([^/@]+)$/);
    if (atSkillMatch) {
      return {
        source: atSkillMatch[1]!,
        skill: atSkillMatch[2]!,
      };
    }

    const segments = cleanPath.split("/").filter(Boolean);
    if (segments.length < 2) {
      return null;
    }

    const skill = segments.pop()!;
    const source = segments.join("/");
    if (!source || !skill) {
      return null;
    }

    return { source, skill };
  } catch {
    return null;
  }
}

function isLocalPathLike(input: string): boolean {
  return (
    input.startsWith("./") ||
    input.startsWith("../") ||
    input.startsWith("/") ||
    input === "." ||
    input === ".." ||
    /^[a-zA-Z]:[/\\]/.test(input)
  );
}

function isPlainWellKnownSource(input: string): boolean {
  if (!input || isLocalPathLike(input)) {
    return false;
  }

  if (input.includes(" ")) {
    return false;
  }

  return !input.includes("/");
}

export function parseDownloadSource(
  source: string,
): ParsedDownloadSource | null {
  const fromSkillsSh = parseFromSkillsShUrl(source);
  if (fromSkillsSh) {
    return parseDownloadSource(`${fromSkillsSh.source}@${fromSkillsSh.skill}`);
  }

  let skillFilter: string | undefined;
  let sourceWithoutSkill = source;

  const atSkillMatch = source.match(/^(.+)@([^/@]+)$/);
  if (atSkillMatch) {
    sourceWithoutSkill = atSkillMatch[1]!;
    skillFilter = atSkillMatch[2]!;
  }

  if (!skillFilter) {
    return null;
  }

  const parsed = parseSource(sourceWithoutSkill);

  if (parsed.type === "local") {
    return null;
  }

  const ownerRepo = getOwnerRepo(parsed);
  if (ownerRepo && parsed.type === "github") {
    const parts = ownerRepo.split("/");
    if (parts.length >= 2) {
      return {
        type: "github",
        owner: parts[0]!,
        repo: parts[1]!,
        skill: skillFilter,
      };
    }
  }

  if (parsed.type === "well-known") {
    return {
      type: "well-known",
      source: parsed.url,
      skill: skillFilter,
    };
  }

  if (isPlainWellKnownSource(sourceWithoutSkill)) {
    return {
      type: "well-known",
      source: sourceWithoutSkill,
      skill: skillFilter,
    };
  }

  return null;
}
