import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import simpleGit, { SimpleGit } from "simple-git";
import { Logger } from "../lib/logger.js";
import { getConfig } from "../lib/config.js";

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

export const OPENCLAW_REPO_URL =
  "https://github.com/adibirzu/openclaw-security-monitor.git";
export const OPENCLAW_DIR_NAME = "openclaw-security-monitor";
export const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function getOpenclawDir(): string {
  // OpenClaw 目录固定由配置系统管理，不支持环境变量覆盖
  return getConfig().getOpenclawDir();
}

export interface UpdateResult {
  updated: boolean;
  version: string;
  message: string;
}

export async function ensureOpenclawRepo(
  forceUpdate: boolean = false,
): Promise<UpdateResult> {
  const openclawDir = getOpenclawDir();
  const versionFile = join(openclawDir, ".wopal-version.json");

  logger.debug(`OpenClaw directory: ${openclawDir}`);

  if (!existsSync(openclawDir)) {
    logger.info("Cloning openclaw-security-monitor repository...");
    return await cloneRepo(openclawDir, versionFile);
  }

  const git = simpleGit(openclawDir);

  try {
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      logger.warn("Directory exists but is not a git repo, re-cloning...");
      return await cloneRepo(openclawDir, versionFile);
    }
  } catch {
    logger.warn("Failed to check git status, re-cloning...");
    return await cloneRepo(openclawDir, versionFile);
  }

  if (forceUpdate) {
    logger.info("Force updating openclaw-security-monitor...");
    return await updateRepo(git, openclawDir, versionFile);
  }

  if (existsSync(versionFile)) {
    try {
      const versionData = JSON.parse(readFileSync(versionFile, "utf-8"));
      const lastUpdate = new Date(versionData.lastUpdate).getTime();
      const now = Date.now();

      if (now - lastUpdate < UPDATE_INTERVAL_MS) {
        logger.debug(
          `OpenClaw updated ${Math.floor((now - lastUpdate) / 1000 / 60 / 60)}h ago, skipping update`,
        );
        return {
          updated: false,
          version: versionData.commit || "unknown",
          message: "Using cached version (updated recently)",
        };
      }
    } catch {
      logger.debug("Failed to read version file, will update");
    }
  }

  logger.info("Updating openclaw-security-monitor...");
  return await updateRepo(git, openclawDir, versionFile);
}

async function cloneRepo(
  targetDir: string,
  versionFile: string,
): Promise<UpdateResult> {
  const git = simpleGit();

  try {
    await git.clone(OPENCLAW_REPO_URL, targetDir, ["--depth", "1"]);
    const clonedGit = simpleGit(targetDir);
    const log = await clonedGit.log(["-1"]);
    const commit = log.latest?.hash.slice(0, 7) || "unknown";

    writeVersionFile(versionFile, commit);

    logger.info(`Cloned successfully (commit: ${commit})`);
    return {
      updated: true,
      version: commit,
      message: "Repository cloned successfully",
    };
  } catch (error) {
    const msg = `Failed to clone repository: ${(error as Error).message}`;
    logger.error(msg);
    throw new Error(msg);
  }
}

async function updateRepo(
  git: SimpleGit,
  targetDir: string,
  versionFile: string,
): Promise<UpdateResult> {
  try {
    const logBefore = await git.log(["-1"]);
    const beforeCommit = logBefore.latest?.hash.slice(0, 7) || "unknown";

    await git.fetch("origin", "main");
    await git.reset(["--hard", "origin/main"]);

    const logAfter = await git.log(["-1"]);
    const afterCommit = logAfter.latest?.hash.slice(0, 7) || "unknown";

    writeVersionFile(versionFile, afterCommit);

    const hasChanges = beforeCommit !== afterCommit;
    const message = hasChanges
      ? `Updated from ${beforeCommit} to ${afterCommit}`
      : "Already up to date";

    logger.info(message);
    return {
      updated: hasChanges,
      version: afterCommit,
      message,
    };
  } catch (error) {
    const msg = `Failed to update repository: ${(error as Error).message}`;
    logger.error(msg);
    throw new Error(msg);
  }
}

function writeVersionFile(versionFile: string, commit: string): void {
  writeFileSync(
    versionFile,
    JSON.stringify(
      {
        commit,
        lastUpdate: new Date().toISOString(),
        source: OPENCLAW_REPO_URL,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

export function validateOpenclawRepo(): { valid: boolean; error?: string } {
  const openclawDir = getOpenclawDir();

  if (!existsSync(openclawDir)) {
    return { valid: false, error: "OpenClaw repository not found" };
  }

  const scanScript = join(openclawDir, "scripts", "scan.sh");
  if (!existsSync(scanScript)) {
    return {
      valid: false,
      error: "scan.sh not found in OpenClaw repository",
    };
  }

  const iocDir = join(openclawDir, "ioc");
  if (!existsSync(iocDir)) {
    return { valid: false, error: "ioc directory not found in OpenClaw" };
  }

  return { valid: true };
}
