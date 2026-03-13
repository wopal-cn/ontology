import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { createServer } from "http";
import { execFile, execSync } from "child_process";
import { resetConfigForTest } from "../src/lib/config.js";

const CLI_PATH = path.join(process.cwd(), "bin", "cli.js");
const TEST_REPO_SKILL = "forztf/open-skilled-sdd@openspec-proposal-creation";

/**
 * 创建 mock openclaw 目录结构
 *
 * wopal-scan-wrapper.sh 会执行 scan.sh，因此需要满足：
 * 1. $WOPAL_HOME/storage/openclaw-security-monitor/scripts/scan.sh 存在且可执行
 * 2. $WOPAL_HOME/storage/openclaw-security-monitor/ioc/ 目录存在
 * 3. .wopal-version.json 存在（避免触发 git clone/pull 更新）
 * 4. scan.sh 包含 SKILLS_DIR= 和 OPENCLAW_DIR= 两行（供 sed 替换）以及实际输出
 *
 * @param wopalHome  - $WOPAL_HOME 路径
 * @param scanOutput - scan.sh 的标准输出内容
 * @param exitCode   - scan.sh 的退出码（0=SECURE, 1=WARNINGS, 2=COMPROMISED）
 */
async function setupMockOpenclaw(
  wopalHome: string,
  scanOutput: string,
  exitCode: number,
): Promise<void> {
  const openclawDir = path.join(
    wopalHome,
    "storage",
    "openclaw-security-monitor",
  );
  const scriptsDir = path.join(openclawDir, "scripts");
  const iocDir = path.join(openclawDir, "ioc");

  await fs.ensureDir(scriptsDir);
  await fs.ensureDir(iocDir);

  // Convert scanOutput lines to echo commands
  const echoCommands = scanOutput
    .split("\n")
    .map((line) => `echo "${line.replace(/"/g, '\\"')}"`)
    .join("\n");

  // scan.sh must contain SKILLS_DIR= and OPENCLAW_DIR= for wopal-scan-wrapper.sh sed replacement
  const scanScript = `#!/bin/bash
SKILLS_DIR="placeholder"
OPENCLAW_DIR="placeholder"

${echoCommands}
exit ${exitCode}
`;
  const scanPath = path.join(scriptsDir, "scan.sh");
  await fs.writeFile(scanPath, scanScript, { mode: 0o755 });

  // Version file: avoid triggering git update (less than 24 hours old)
  await fs.writeJson(path.join(openclawDir, ".wopal-version.json"), {
    commit: "mockcommit",
    lastUpdate: new Date().toISOString(),
    source: "mock",
  });
}

async function startWellKnownSkillServer(skillName: string): Promise<{
  source: string;
  host: string;
  close: () => Promise<void>;
}> {
  const server = createServer((req, res) => {
    if (req.url === "/.well-known/skills/index.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          skills: [
            {
              name: skillName,
              description: "Well-known integration test skill",
              files: ["references/guide.md"],
            },
          ],
        }),
      );
      return;
    }

    if (req.url === `/.well-known/skills/${skillName}/SKILL.md`) {
      res.writeHead(200, { "Content-Type": "text/markdown" });
      res.end(
        `---\nname: ${skillName}\ndescription: Well-known integration test skill\n---\n# ${skillName}`,
      );
      return;
    }

    if (req.url === `/.well-known/skills/${skillName}/references/guide.md`) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Guide content");
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve well-known server address");
  }

  const host = `127.0.0.1:${address.port}`;

  return {
    source: `http://${host}`,
    host,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
}

describe("Install Command Integration Tests", () => {
  let tempDir: string;
  let inboxDir: string;
  let projectDir: string;
  let wopalHome: string;

  beforeEach(async () => {
    resetConfigForTest();
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "wopal-cli-integration-"),
    );
    inboxDir = path.join(tempDir, "INBOX");
    projectDir = path.join(tempDir, "project");
    wopalHome = path.join(tempDir, ".wopal");

    await fs.ensureDir(inboxDir);
    await fs.ensureDir(projectDir);
    await fs.ensureDir(wopalHome);

    // 将 WOPAL_HOME 指向 tempDir，使 getOpenclawDir() 返回可控的 mock 路径
    process.env.WOPAL_HOME = wopalHome;
    process.env.WOPAL_SKILLS_INBOX_DIR = inboxDir;
    process.env.WOPAL_SETTINGS_PATH = path.join(tempDir, "settings.jsonc");

    // Initialize workspace for tests
    execSync(`node ${CLI_PATH} init test-workspace ${projectDir}`, {
      encoding: "utf-8",
      env: { ...process.env },
    });
  });

  afterEach(async () => {
    resetConfigForTest();
    await fs.remove(tempDir);
    delete process.env.WOPAL_HOME;
    delete process.env.WOPAL_SKILLS_INBOX_DIR;
    delete process.env.WOPAL_SETTINGS_PATH;
  });

  async function createTestSkill(
    skillDir: string,
    name: string,
  ): Promise<void> {
    await fs.ensureDir(skillDir);
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---\nname: ${name}\ndescription: Test skill\n---\n# ${name}\n\nTest skill content.`,
    );
  }

  it("should install skill from INBOX to space-level and preserve INBOX by default", async () => {
    await setupMockOpenclaw(
      wopalHome,
      `[1/3] Check reverse shell
CLEAN: No reverse shell found
[2/3] Check malware
CLEAN: No malware found
[3/3] Check C2
CLEAN: No C2 found`,
      0,
    );

    const skillName = "test-skill";
    const inboxSkillDir = path.join(inboxDir, skillName);

    await createTestSkill(inboxSkillDir, skillName);

    await fs.writeJson(path.join(inboxSkillDir, ".source.json"), {
      name: skillName,
      description: "Test skill",
      source: "owner/repo@skill",
      sourceUrl: "https://github.com/owner/repo",
      skillPath: "skills/test-skill",
      downloadedAt: new Date().toISOString(),
      skillFolderHash: "test-hash-123",
    });

    const output = execSync(`node ${CLI_PATH} skills install ${skillName}`, {
      cwd: projectDir,
      encoding: "utf-8",
      env: { ...process.env },
    });

    expect(output).toContain("Installation complete");
    expect(output).toContain("Security scan passed");

    const installedDir = path.join(projectDir, ".wopal", "skills", skillName);
    expect(await fs.pathExists(installedDir)).toBe(true);
    expect(await fs.pathExists(path.join(installedDir, "SKILL.md"))).toBe(true);

    expect(await fs.pathExists(inboxSkillDir)).toBe(true);

    const lockPath = path.join(
      projectDir,
      ".wopal",
      "skills",
      ".skill-lock.json",
    );
    expect(await fs.pathExists(lockPath)).toBe(true);

    const lock = await fs.readJson(lockPath);
    expect(lock.version).toBe(3);
    expect(lock.skills[skillName]).toBeDefined();
    expect(lock.skills[skillName].source).toBe("owner/repo");

    const globalLockPath = path.join(wopalHome, "skills", ".skill-lock.json");
    if (await fs.pathExists(globalLockPath)) {
      const globalLock = await fs.readJson(globalLockPath);
      expect(globalLock.skills[skillName]).toBeUndefined();
    }
  }, 30000);

  it("should install skill from local path", async () => {
    const skillName = "local-skill";
    const localSkillDir = path.join(tempDir, "my-skills", skillName);

    await createTestSkill(localSkillDir, skillName);

    const output = execSync(
      `node ${CLI_PATH} skills install ${localSkillDir}`,
      { cwd: projectDir, encoding: "utf-8", env: { ...process.env } },
    );

    expect(output).toContain("Installation complete");

    const installedDir = path.join(projectDir, ".wopal", "skills", skillName);
    expect(await fs.pathExists(installedDir)).toBe(true);

    expect(await fs.pathExists(localSkillDir)).toBe(true);
  });

  it("should handle --force flag", async () => {
    const skillName = "force-skill";
    const inboxSkillDir = path.join(inboxDir, skillName);

    await createTestSkill(inboxSkillDir, skillName);
    await fs.writeJson(path.join(inboxSkillDir, ".source.json"), {
      name: skillName,
      source: "owner/repo@skill",
      sourceUrl: "https://github.com/owner/repo",
      skillPath: "skills/force-skill",
      downloadedAt: new Date().toISOString(),
      skillFolderHash: "force-hash-001",
    });

    execSync(`node ${CLI_PATH} skills install ${skillName} --skip-scan`, {
      cwd: projectDir,
      encoding: "utf-8",
      env: { ...process.env },
    });

    await createTestSkill(inboxSkillDir, skillName);
    await fs.writeJson(path.join(inboxSkillDir, ".source.json"), {
      name: skillName,
      source: "owner/repo@skill",
      sourceUrl: "https://github.com/owner/repo",
      skillPath: "skills/force-skill",
      downloadedAt: new Date().toISOString(),
      skillFolderHash: "force-hash-002",
    });

    const output = execSync(
      `node ${CLI_PATH} skills install ${skillName} --force --skip-scan`,
      { cwd: projectDir, encoding: "utf-8", env: { ...process.env } },
    );

    expect(output).toContain("Installation complete");
  });

  it("should reject symlink mode", async () => {
    const skillName = "symlink-skill";
    const inboxSkillDir = path.join(inboxDir, skillName);

    await createTestSkill(inboxSkillDir, skillName);
    await fs.writeJson(path.join(inboxSkillDir, ".source.json"), {
      name: skillName,
      source: "owner/repo@skill",
      sourceUrl: "https://github.com/owner/repo",
      skillPath: "skills/symlink-skill",
      downloadedAt: new Date().toISOString(),
    });

    try {
      execSync(`node ${CLI_PATH} skills install ${skillName} --mode symlink`, {
        cwd: projectDir,
        encoding: "utf-8",
        env: { ...process.env },
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error.message).toContain("symlink mode is not implemented yet");
    }
  });

  it("should download remote skill with version fingerprint metadata", async () => {
    const output = execSync(
      `node ${CLI_PATH} skills download ${TEST_REPO_SKILL} --force`,
      {
        cwd: projectDir,
        encoding: "utf-8",
        env: {
          ...process.env,
          WOPAL_SKILLS_INBOX_DIR: inboxDir,
        },
      },
    );

    expect(output).toContain(
      "Downloaded skill 'openspec-proposal-creation' to INBOX",
    );

    const metadataPath = path.join(
      inboxDir,
      "openspec-proposal-creation",
      ".source.json",
    );
    const metadata = await fs.readJson(metadataPath);

    expect(metadata.skillFolderHash).toMatch(/^[a-f0-9]{40}$/);
    expect(metadata.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(metadata.source).toBe(TEST_REPO_SKILL);
  }, 30000);

  it("should include ref when downloading from specific branch", async () => {
    execSync(
      `node ${CLI_PATH} skills download ${TEST_REPO_SKILL} --branch main --force`,
      {
        cwd: projectDir,
        encoding: "utf-8",
        env: {
          ...process.env,
          WOPAL_SKILLS_INBOX_DIR: inboxDir,
        },
      },
    );

    const metadataPath = path.join(
      inboxDir,
      "openspec-proposal-creation",
      ".source.json",
    );
    const metadata = await fs.readJson(metadataPath);

    expect(metadata.ref).toBe("main");
    expect(metadata.tag).toBeUndefined();
  }, 30000);

  it("should report missing skill from repository", () => {
    try {
      execSync(
        `node ${CLI_PATH} skills download forztf/open-skilled-sdd@definitely-missing-skill-name`,
        {
          cwd: projectDir,
          encoding: "utf-8",
          env: {
            ...process.env,
            WOPAL_SKILLS_INBOX_DIR: inboxDir,
          },
          stdio: "pipe",
        },
      );

      expect.fail("Should have thrown an error");
    } catch (error: any) {
      const message = `${error.stdout || ""}${error.stderr || ""}${error.message || ""}`;
      expect(message).toContain("not found in repository");
    }
  }, 30000);

  it("should remove INBOX skill when --rm-inbox flag is used", async () => {
    await setupMockOpenclaw(
      wopalHome,
      `[1/3] Check reverse shell
CLEAN: No reverse shell found`,
      0,
    );

    const skillName = "rm-inbox-skill";
    const inboxSkillDir = path.join(inboxDir, skillName);

    await createTestSkill(inboxSkillDir, skillName);
    await fs.writeJson(path.join(inboxSkillDir, ".source.json"), {
      name: skillName,
      source: "owner/repo@skill",
      sourceUrl: "https://github.com/owner/repo",
      skillPath: "skills/rm-inbox-skill",
      downloadedAt: new Date().toISOString(),
      skillFolderHash: "test-hash-rm",
    });

    const output = execSync(
      `node ${CLI_PATH} skills install ${skillName} --rm-inbox`,
      {
        cwd: projectDir,
        encoding: "utf-8",
        env: { ...process.env },
      },
    );

    expect(output).toContain("Installation complete");

    expect(await fs.pathExists(inboxSkillDir)).toBe(false);

    const installedDir = path.join(projectDir, ".wopal", "skills", skillName);
    expect(await fs.pathExists(installedDir)).toBe(true);
  });

  it("should install skill to global scope with -g flag", async () => {
    await setupMockOpenclaw(wopalHome, `CLEAN: All checks passed`, 0);

    const skillName = "global-skill";
    const inboxSkillDir = path.join(inboxDir, skillName);

    await createTestSkill(inboxSkillDir, skillName);
    await fs.writeJson(path.join(inboxSkillDir, ".source.json"), {
      name: skillName,
      source: "owner/repo@skill",
      sourceUrl: "https://github.com/owner/repo",
      skillPath: "skills/global-skill",
      downloadedAt: new Date().toISOString(),
      skillFolderHash: "test-hash-global",
    });

    const output = execSync(
      `node ${CLI_PATH} skills install ${skillName} -g --skip-scan`,
      {
        cwd: projectDir,
        encoding: "utf-8",
        env: { ...process.env },
      },
    );

    expect(output).toContain("Installation complete");

    const globalInstalledDir = path.join(wopalHome, "skills", skillName);
    expect(await fs.pathExists(globalInstalledDir)).toBe(true);

    const spaceInstalledDir = path.join(
      projectDir,
      ".wopal",
      "skills",
      skillName,
    );
    expect(await fs.pathExists(spaceInstalledDir)).toBe(false);

    const globalLockPath = path.join(wopalHome, "skills", ".skill-lock.json");
    const globalLock = await fs.readJson(globalLockPath);
    expect(globalLock.skills[skillName]).toBeDefined();

    const spaceLockPath = path.join(
      projectDir,
      ".wopal",
      "skills",
      ".skill-lock.json",
    );
    if (await fs.pathExists(spaceLockPath)) {
      const spaceLock = await fs.readJson(spaceLockPath);
      expect(spaceLock.skills[skillName]).toBeUndefined();
    }
  });

  it("should preserve INBOX when scan fails during install", async () => {
    await setupMockOpenclaw(
      wopalHome,
      `[1/3] Check malware
CRITICAL: Malware detected`,
      2,
    );

    const skillName = "scan-fail-skill";
    const inboxSkillDir = path.join(inboxDir, skillName);

    await createTestSkill(inboxSkillDir, skillName);
    await fs.writeJson(path.join(inboxSkillDir, ".source.json"), {
      name: skillName,
      source: "owner/repo@skill",
      sourceUrl: "https://github.com/owner/repo",
      skillPath: "skills/scan-fail-skill",
      downloadedAt: new Date().toISOString(),
      skillFolderHash: "mock-hash-scan-fail",
    });

    try {
      execSync(`node ${CLI_PATH} skills install ${skillName}`, {
        cwd: projectDir,
        encoding: "utf-8",
        env: { ...process.env },
        stdio: "pipe",
      });
      expect.fail("Should have thrown an error due to scan failure");
    } catch (error: any) {
      const message = `${error.stdout || ""}${error.stderr || ""}`;
      expect(message).toMatch(/Security scan failed/i);
    }

    expect(await fs.pathExists(inboxSkillDir)).toBe(true);

    const installedDir = path.join(projectDir, ".wopal", "skills", skillName);
    expect(await fs.pathExists(installedDir)).toBe(false);
  });

  it("should install remote well-known source by reusing download flow", async () => {
    const skillName = "superpowers";
    const server = await startWellKnownSkillServer(skillName);

    try {
      const output = await new Promise<string>((resolve, reject) => {
        execFile(
          "node",
          [
            CLI_PATH,
            "skills",
            "install",
            `${server.source}@${skillName}`,
            "--skip-scan",
            "--force",
          ],
          {
            cwd: projectDir,
            encoding: "utf-8",
            env: {
              ...process.env,
              WOPAL_SKILLS_INBOX_DIR: inboxDir,
            },
          },
          (error, stdout, stderr) => {
            if (error) {
              reject(
                Object.assign(error, {
                  message: `${error.message}\n${stdout || ""}${stderr || ""}`,
                }),
              );
              return;
            }
            resolve(stdout);
          },
        );
      });

      expect(output).toContain(
        `Installing remote skill: ${server.source}@${skillName}`,
      );
      expect(output).toContain(`Installation complete: ${skillName}`);

      const installedSkillDir = path.join(
        projectDir,
        ".wopal",
        "skills",
        skillName,
      );
      expect(
        await fs.pathExists(path.join(installedSkillDir, "SKILL.md")),
      ).toBe(true);
      expect(
        await fs.pathExists(
          path.join(installedSkillDir, "references", "guide.md"),
        ),
      ).toBe(true);

      const lockPath = path.join(
        projectDir,
        ".wopal",
        "skills",
        ".skill-lock.json",
      );
      const lock = await fs.readJson(lockPath);

      expect(lock.skills[skillName].sourceType).toBe("well-known");
      expect(lock.skills[skillName].source).toBe(server.host);
    } finally {
      await server.close();
    }
  });
});
