import simpleGit from "simple-git";
import { join, normalize, resolve, sep } from "path";
import { mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";

const CLONE_TIMEOUT_MS = 60000;

export class GitCloneError extends Error {
  readonly url: string;
  readonly isTimeout: boolean;
  readonly isAuthError: boolean;

  constructor(
    message: string,
    url: string,
    isTimeout = false,
    isAuthError = false,
  ) {
    super(message);
    this.name = "GitCloneError";
    this.url = url;
    this.isTimeout = isTimeout;
    this.isAuthError = isAuthError;
  }
}

interface GitHubContent {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink";
  download_url: string | null;
}

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number = 30000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function downloadViaGitHubApi(
  owner: string,
  repo: string,
  skillPath: string,
  ref?: string,
): Promise<{ tempDir: string; commitSha: string }> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const tempDir = join(tmpdir(), "wopal", `skills-api-${timestamp}-${random}`);

  await mkdir(tempDir, { recursive: true });

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "wopal-cli",
  };

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const candidateRefs: string[] = [];
  if (ref) {
    candidateRefs.push(ref);
  } else {
    const repoInfoResponse = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}`,
      headers,
    );

    if (repoInfoResponse.ok) {
      const repoData = (await repoInfoResponse.json()) as {
        default_branch?: string;
      };
      if (repoData.default_branch) {
        candidateRefs.push(repoData.default_branch);
      }
    }
    candidateRefs.push("main", "master");
  }

  const uniqueRefs = Array.from(new Set(candidateRefs));
  let lastStatus: number | null = null;

  for (const candidateRef of uniqueRefs) {
    const commitResponse = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}/commits/${candidateRef}`,
      headers,
    );

    if (!commitResponse.ok) {
      lastStatus = commitResponse.status;
      continue;
    }

    const commitData = (await commitResponse.json()) as { sha: string };
    await downloadDirectory(
      owner,
      repo,
      skillPath,
      candidateRef,
      tempDir,
      headers,
    );
    return { tempDir, commitSha: commitData.sha };
  }

  throw new GitCloneError(
    `Failed to get commit info: ${lastStatus ?? "unknown"}`,
    `https://github.com/${owner}/${repo}`,
    false,
    lastStatus === 404 || lastStatus === 403,
  );
}

async function downloadDirectory(
  owner: string,
  repo: string,
  dirPath: string,
  ref: string,
  destDir: string,
  headers: Record<string, string>,
): Promise<void> {
  let cleanPath = dirPath.replace(/^\/+/, "").replace(/\/+$/, "");

  const response = await fetchWithTimeout(
    `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}?ref=${ref}`,
    headers,
  );

  if (!response.ok) {
    throw new Error(
      `Failed to list directory ${cleanPath}: ${response.status}`,
    );
  }

  const contents = (await response.json()) as GitHubContent[];

  if (!Array.isArray(contents)) {
    throw new Error(`Expected directory, got file at ${cleanPath}`);
  }

  await Promise.all(
    contents.map(async (item) => {
      const itemDestPath = join(destDir, item.name);

      if (item.type === "dir") {
        await mkdir(itemDestPath, { recursive: true });
        await downloadDirectory(
          owner,
          repo,
          item.path,
          ref,
          itemDestPath,
          headers,
        );
      } else if (item.type === "file" && item.download_url) {
        const fileResponse = await fetchWithTimeout(item.download_url, {});
        if (!fileResponse.ok) {
          throw new Error(`Failed to download file ${item.path}`);
        }
        const content = await fileResponse.text();
        await writeFile(itemDestPath, content, "utf-8");
      }
    }),
  );
}

export function parseGitHubUrl(
  url: string,
): { owner: string; repo: string } | null {
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1]!, repo: httpsMatch[2]! };
  }

  const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1]!, repo: sshMatch[2]! };
  }

  return null;
}

export async function cloneRepo(
  url: string,
  ref?: string,
): Promise<{ tempDir: string; commitSha: string }> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const tempDir = join(tmpdir(), "wopal", `skills-${timestamp}-${random}`);

  await mkdir(join(tmpdir(), "wopal"), { recursive: true });

  const git = simpleGit({
    timeout: { block: CLONE_TIMEOUT_MS },
  });
  const cloneOptions = ref
    ? ["--depth", "1", "--branch", ref]
    : ["--depth", "1"];

  try {
    await git.clone(url, tempDir, cloneOptions);

    const repoGit = simpleGit(tempDir);
    const log = await repoGit.log(["-1"]);
    const commitSha = log.latest?.hash;

    if (!commitSha) {
      throw new Error("Failed to get commit SHA after clone");
    }

    return { tempDir, commitSha };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});

    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout =
      errorMessage.includes("block timeout") ||
      errorMessage.includes("timed out");
    const isAuthError =
      errorMessage.includes("Authentication failed") ||
      errorMessage.includes("could not read Username") ||
      errorMessage.includes("Permission denied") ||
      errorMessage.includes("Repository not found");

    if (isTimeout) {
      throw new GitCloneError(
        `Clone timed out after 60s. This often happens with private repos that require authentication.\n` +
          `  Ensure you have access and your SSH keys or credentials are configured:\n` +
          `  - For SSH: ssh-add -l (to check loaded keys)\n` +
          `  - For HTTPS: gh auth status (if using GitHub CLI)`,
        url,
        true,
        false,
      );
    }

    if (isAuthError) {
      throw new GitCloneError(
        `Authentication failed for ${url}.\n` +
          `  - For private repos, ensure you have access\n` +
          `  - For SSH: Check your keys with 'ssh -T git@github.com'\n` +
          `  - For HTTPS: Run 'gh auth login' or configure git credentials`,
        url,
        false,
        true,
      );
    }

    throw new GitCloneError(
      `Failed to clone ${url}: ${errorMessage}`,
      url,
      false,
      false,
    );
  }
}

export async function cleanupTempDir(dir: string): Promise<void> {
  const normalizedDir = normalize(resolve(dir));
  const normalizedTmpDir = normalize(resolve(tmpdir()));

  if (
    !normalizedDir.startsWith(normalizedTmpDir + sep) &&
    normalizedDir !== normalizedTmpDir
  ) {
    throw new Error(
      "Attempted to clean up directory outside of temp directory",
    );
  }

  await rm(dir, { recursive: true, force: true });
}
