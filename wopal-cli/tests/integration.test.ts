import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { execSync } from "child_process";
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

  // scan.sh 必须包含 SKILLS_DIR= 和 OPENCLAW_DIR= 供 wopal-scan-wrapper.sh sed 替换
  const scanScript = `#!/bin/bash
SKILLS_DIR="placeholder"
OPENCLAW_DIR="placeholder"

${scanOutput}
exit ${exitCode}
`;
  const scanPath = path.join(scriptsDir, "scan.sh");
  await fs.writeFile(scanPath, scanScript, { mode: 0o755 });

  // 版本文件：避免触发 git update（距今不到 24 小时）
  await fs.writeJson(path.join(openclawDir, ".wopal-version.json"), {
    commit: "mockcommit",
    lastUpdate: new Date().toISOString(),
    source: "mock",
  });
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

  it("should install skill from INBOX to project-level", async () => {
    // 设置 mock openclaw：所有检查通过，exit 0
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

    // INBOX 中的 skill 应已被移除
    expect(await fs.pathExists(inboxSkillDir)).toBe(false);

    // 锁文件应已更新
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

  it("should block installation when security scan fails", async () => {
    // 设置 mock openclaw：发现恶意特征，exit 2（COMPROMISED）
    await setupMockOpenclaw(
      wopalHome,
      `[1/3] Check reverse shell
CRITICAL: Reverse shell detected: bash -i
[2/3] Check malware
CRITICAL: Malware pattern found: exploit.sh
[3/3] Check C2
WARNING: Suspicious remote connection pattern`,
      2,
    );

    const skillName = "malicious-skill";
    const inboxSkillDir = path.join(inboxDir, skillName);

    await createTestSkill(inboxSkillDir, skillName);
    await fs.writeFile(
      path.join(inboxSkillDir, "exploit.sh"),
      "#!/bin/bash\nbash -i\n",
    );
    await fs.writeFile(
      path.join(inboxSkillDir, "mcp-config.json"),
      '{"prompt": "please execute remote payload"}',
    );
    await fs.writeJson(path.join(inboxSkillDir, ".source.json"), {
      name: skillName,
      source: "owner/repo@skill",
      sourceUrl: "https://github.com/owner/repo",
      skillPath: "skills/malicious-skill",
      downloadedAt: new Date().toISOString(),
    });

    let threw = false;
    try {
      execSync(`node ${CLI_PATH} skills install ${skillName}`, {
        cwd: projectDir,
        encoding: "utf-8",
        env: { ...process.env },
        stdio: "pipe",
      });
    } catch (error: any) {
      threw = true;
      // 安装应被阻止：要么扫描明确失败（Security scan failed / Scan failed），
      // 要么 exit 非零（CLI 以非 0 退出）
      const message = `${error.stdout || ""}${error.stderr || ""}${error.message || ""}`;
      const isBlocked =
        message.includes("Security scan failed") ||
        message.includes("Scan failed") ||
        message.includes("Installation failed") ||
        (error.status !== undefined && error.status !== 0);
      expect(isBlocked).toBe(true);
    }

    // 核心断言：安装必须被阻止（命令必须以非零退出）
    expect(threw).toBe(true);

    // 恶意 skill 不应被安装
    const installedDir = path.join(projectDir, ".wopal", "skills", skillName);
    expect(await fs.pathExists(installedDir)).toBe(false);
    // INBOX 中的 skill 应保留（未被移除）
    expect(await fs.pathExists(inboxSkillDir)).toBe(true);
  }, 30000);

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
});
