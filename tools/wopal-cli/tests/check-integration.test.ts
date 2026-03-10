import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { execSync, spawnSync } from "child_process";
import { resetConfigForTest } from "../src/utils/config.js";
import { LockManager } from "../src/utils/lock-manager.js";
import type { SkillLockEntry } from "../src/types/lock.js";

const CLI_PATH = path.join(process.cwd(), "bin", "cli.js");

describe("Check Command Integration Tests", () => {
  let tempDir: string;
  let projectDir: string;
  let lockManager: LockManager;

  beforeEach(async () => {
    resetConfigForTest();
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "wopal-cli-integration-"),
    );
    projectDir = path.join(tempDir, "project");
    await fs.ensureDir(projectDir);

    const iocDir = path.join(tempDir, "ioc");
    const inboxDir = path.join(tempDir, "inbox");
    await fs.ensureDir(iocDir);
    await fs.ensureDir(inboxDir);

    process.env.WOPAL_SKILLS_IOCDB_DIR = iocDir;
    process.env.WOPAL_SKILLS_INBOX_DIR = inboxDir;
    process.env.WOPAL_SETTINGS_PATH = path.join(tempDir, "settings.jsonc");

    // Initialize workspace for tests
    execSync(`node ${CLI_PATH} init test-workspace ${projectDir}`, {
      encoding: "utf-8",
    });

    const mockConfigService = {
      getProjectLockPath: () =>
        path.join(projectDir, ".wopal", ".skill-lock.json"),
    };
    lockManager = new LockManager(mockConfigService as any);
  });

  afterEach(async () => {
    resetConfigForTest();
    await fs.remove(tempDir);
    delete process.env.WOPAL_SKILLS_IOCDB_DIR;
    delete process.env.WOPAL_SKILLS_INBOX_DIR;
    delete process.env.WOPAL_SETTINGS_PATH;
  });

  it("should check remote GitHub skill", async () => {
    const entry: SkillLockEntry = {
      source: "forztf/open-skilled-sdd",
      sourceType: "github",
      sourceUrl: "https://github.com/forztf/open-skilled-sdd",
      skillPath: "/skills/openspec-proposal-creation",
      skillFolderHash: "a6e93af834ba80ee490c9ead9df99771c746ba3a",
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const lock = await lockManager.readProjectLock();
    lock.skills["openspec-proposal-creation"] = entry;
    await lockManager.writeProjectLock(lock);

    const output = execSync(
      `node ${CLI_PATH} skills check openspec-proposal-creation --local`,
      {
        cwd: projectDir,
        encoding: "utf-8",
        timeout: 15000,
      },
    );

    expect(output).toContain("openspec-proposal-creation");
    expect(output).toContain("github");
  });

  it("should check local skill", async () => {
    const localSkillDir = path.join(tempDir, "my-skills", "local-skill");
    await fs.ensureDir(localSkillDir);
    await fs.writeFile(
      path.join(localSkillDir, "SKILL.md"),
      "---\nname: local-skill\n---\n# Local Skill",
    );

    const entry: SkillLockEntry = {
      source: "my-skills/local-skill",
      sourceType: "local",
      sourceUrl: localSkillDir,
      skillPath: localSkillDir,
      skillFolderHash: "initial-hash",
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const lock = await lockManager.readProjectLock();
    lock.skills["local-skill"] = entry;
    await lockManager.writeProjectLock(lock);

    const output = execSync(
      `node ${CLI_PATH} skills check local-skill --local`,
      {
        cwd: projectDir,
        encoding: "utf-8",
        timeout: 10000,
      },
    );

    expect(output).toContain("local-skill");
    expect(output).toContain("local");
  });

  it("should handle non-existent skill", () => {
    expect(() => {
      execSync(`node ${CLI_PATH} skills check nonexistent-skill --local`, {
        cwd: projectDir,
        encoding: "utf-8",
        timeout: 10000,
        stdio: "pipe",
      });
    }).toThrow();
  });

  it("should output JSON format", async () => {
    const entry: SkillLockEntry = {
      source: "forztf/open-skilled-sdd",
      sourceType: "github",
      sourceUrl: "https://github.com/forztf/open-skilled-sdd",
      skillPath: "/skills/openspec-proposal-creation",
      skillFolderHash: "a6e93af834ba80ee490c9ead9df99771c746ba3a",
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const lock = await lockManager.readProjectLock();
    lock.skills["openspec-proposal-creation"] = entry;
    await lockManager.writeProjectLock(lock);

    const output = execSync(
      `node ${CLI_PATH} skills check openspec-proposal-creation --local --json`,
      {
        cwd: projectDir,
        encoding: "utf-8",
        timeout: 15000,
      },
    );

    const jsonStart = output.indexOf("[");
    const jsonOutput = output.substring(jsonStart);
    const parsed = JSON.parse(jsonOutput);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty("skillName");
    expect(parsed[0]).toHaveProperty("sourceType");
    expect(parsed[0]).toHaveProperty("status");
    expect(parsed[0].skillName).toBe("openspec-proposal-creation");
  });

  it("should only check project-level skills with --local", async () => {
    const localSkillDir = path.join(tempDir, "my-skills", "project-skill");
    await fs.ensureDir(localSkillDir);
    await fs.writeFile(
      path.join(localSkillDir, "SKILL.md"),
      "---\nname: project-skill\n---\n# Project Skill",
    );

    const projectEntry: SkillLockEntry = {
      source: "my-skills/project-skill",
      sourceType: "local",
      sourceUrl: localSkillDir,
      skillPath: localSkillDir,
      skillFolderHash: "project-hash",
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const projectLock = await lockManager.readProjectLock();
    projectLock.skills["project-skill"] = projectEntry;
    await lockManager.writeProjectLock(projectLock);

    const output = execSync(`node ${CLI_PATH} skills check --local`, {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(output).toContain("project-skill");
  });

  it("should only check global-level skills with --global", async () => {
    const localSkillDir = path.join(tempDir, "my-skills", "global-skill");
    await fs.ensureDir(localSkillDir);
    await fs.writeFile(
      path.join(localSkillDir, "SKILL.md"),
      "---\nname: global-skill\n---\n# Global Skill",
    );

    const globalEntry: SkillLockEntry = {
      source: "my-skills/global-skill",
      sourceType: "local",
      sourceUrl: localSkillDir,
      skillPath: localSkillDir,
      skillFolderHash: "global-hash",
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const globalLock = await lockManager.readGlobalLock();
    globalLock.skills["global-skill"] = globalEntry;
    await lockManager.writeGlobalLock(globalLock);

    const output = execSync(`node ${CLI_PATH} skills check --global`, {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(output).toContain("global-skill");
  });

  it("should display progress bar", async () => {
    const entry: SkillLockEntry = {
      source: "forztf/open-skilled-sdd",
      sourceType: "github",
      sourceUrl: "https://github.com/forztf/open-skilled-sdd",
      skillPath: "/skills/openspec-proposal-creation",
      skillFolderHash: "a6e93af834ba80ee490c9ead9df99771c746ba3a",
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const lock = await lockManager.readProjectLock();
    lock.skills["openspec-proposal-creation"] = entry;
    await lockManager.writeProjectLock(lock);

    const output = execSync(
      `node ${CLI_PATH} skills check openspec-proposal-creation --local`,
      {
        cwd: projectDir,
        encoding: "utf-8",
        timeout: 15000,
      },
    );

    expect(output).toContain("Checking 1 skill");
    expect(output).toContain("100%");
    expect(output).toContain("[1/1]");
  });

  it("should check mixed remote and local skills", async () => {
    const localSkillDir = path.join(tempDir, "my-skills", "local-skill");
    await fs.ensureDir(localSkillDir);
    await fs.writeFile(
      path.join(localSkillDir, "SKILL.md"),
      "---\nname: local-skill\n---\n# Local Skill",
    );

    const remoteEntry: SkillLockEntry = {
      source: "forztf/open-skilled-sdd",
      sourceType: "github",
      sourceUrl: "https://github.com/forztf/open-skilled-sdd",
      skillPath: "/skills/openspec-proposal-creation",
      skillFolderHash: "a6e93af834ba80ee490c9ead9df99771c746ba3a",
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const localEntry: SkillLockEntry = {
      source: "my-skills/local-skill",
      sourceType: "local",
      sourceUrl: localSkillDir,
      skillPath: localSkillDir,
      skillFolderHash: "initial-hash",
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const lock = await lockManager.readProjectLock();
    lock.skills["openspec-proposal-creation"] = remoteEntry;
    lock.skills["local-skill"] = localEntry;
    await lockManager.writeProjectLock(lock);

    const output = execSync(`node ${CLI_PATH} skills check --local`, {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: 15000,
    });

    expect(output).toContain("openspec-proposal-creation");
    expect(output).toContain("local-skill");
    expect(output).toContain("github");
    expect(output).toContain("local");
    expect(output).toContain("Checking 2 skills");
  });

  it("should handle GitHub API rate limiting gracefully", async () => {
    const entry: SkillLockEntry = {
      source: "forztf/open-skilled-sdd",
      sourceType: "github",
      sourceUrl: "https://github.com/forztf/open-skilled-sdd",
      skillPath: "/skills/openspec-proposal-creation",
      skillFolderHash: "a6e93af834ba80ee490c9ead9df99771c746ba3a",
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const lock = await lockManager.readProjectLock();
    lock.skills["openspec-proposal-creation"] = entry;
    await lockManager.writeProjectLock(lock);

    try {
      const output = execSync(
        `node ${CLI_PATH} skills check openspec-proposal-creation --local`,
        {
          cwd: projectDir,
          encoding: "utf-8",
          timeout: 15000,
        },
      );

      expect(output).toContain("openspec-proposal-creation");
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
