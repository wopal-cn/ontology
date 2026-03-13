# wopal-cli install 命令优化方案

## 背景

当前 `install` 命令存在以下问题：
1. **Lock 重复写入**：`addSkillToBothLocks()` 无条件同时写入 global 和 space 两个 lock 文件
2. **命名不准确**：`project` 级应称为 `space` 级
3. **INBOX 强制删除**：安装后直接删除 INBOX 中的技能，无法保留
4. **缺少快捷安装**：不支持 `owner/repo@skill` 格式直接安装

## 修改范围

| 文件 | 修改类型 | 影响范围 |
|------|----------|----------|
| `src/types/lock.ts` | 类型定义 | InstallScope 类型值 |
| `src/lib/lock-manager.ts` | 方法重构 | Lock 写入逻辑 |
| `src/commands/skills/install.ts` | 核心重构 | 源识别、安装流程、参数 |
| `src/commands/skills/list.ts` | 文案 | --local 描述 |
| `src/commands/skills/check.ts` | 文案 | --local 描述 |
| `tests/lock-manager.test.ts` | 测试 | 移除旧方法测试，新增 scope-aware 测试 |
| `tests/integration.test.ts` | 测试 | INBOX 保留、lock 分离、远程安装测试 |
| `AGENTS.md` | 文档 | 命令速查、新增章节 |

---

## 详细修改方案

### 1. 类型定义 (`src/types/lock.ts`)

**修改前**：
```typescript
export type InstallScope = "project" | "global";
```

**修改后**：
```typescript
export type InstallScope = "space" | "global";
```

---

### 2. Lock 管理器 (`src/lib/lock-manager.ts`)

**移除方法**：
```typescript
async addSkillToBothLocks(skillName: string, entry: SkillLockEntry): Promise<void>
```

**新增方法**：
```typescript
async addSkillToLock(
  skillName: string,
  entry: SkillLockEntry,
  scope: InstallScope,
): Promise<void> {
  const now = new Date().toISOString();
  const entryWithTimestamp = { ...entry, updatedAt: now };

  if (scope === "global") {
    const globalLock = await this.readGlobalLock();
    globalLock.skills[skillName] = entryWithTimestamp;
    await this.writeGlobalLock(globalLock);
  } else {
    const spaceLock = await this.readProjectLock();
    spaceLock.skills[skillName] = entryWithTimestamp;
    await this.writeProjectLock(spaceLock);
  }
}
```

**说明**：
- `readProjectLock` / `writeProjectLock` 方法名保持不变（内部实现）
- 仅修改调用方传入的 scope 参数

---

### 3. install 命令 (`src/commands/skills/install.ts`)

#### 3.1 接口定义

**修改前**：
```typescript
interface InstallOptions {
  global: boolean;
  force: boolean;
  skipScan: boolean;
  mode: InstallMode;
}
```

**修改后**：
```typescript
interface InstallOptions {
  global: boolean;
  force: boolean;
  skipScan: boolean;
  mode: InstallMode;
  rmInbox: boolean;  // 新增：安装后删除 INBOX
}
```

#### 3.2 源类型识别函数（新增）

```typescript
type SourceType = "local" | "inbox" | "remote";

function detectSourceType(source: string): SourceType {
  // 本地路径: 绝对路径 (/xxx 或 C:\xxx)
  if (/^\/|^[a-zA-Z]:[/\\]/.test(source)) {
    return "local";
  }
  // 远程技能: owner/repo@skill 格式
  // 规则: owner/repo@skill-name（不含额外路径分隔符）
  if (/^[^/]+\/[^/@]+@[^/]+$/.test(source)) {
    return "remote";
  }
  // INBOX 技能名
  return "inbox";
}
```

**识别规则**：

| 格式 | 识别为 | 示例 |
|------|--------|------|
| `/absolute/path` | local | `/home/user/my-skill` |
| `C:\path` | local | `C:\skills\my-skill` |
| `owner/repo@skill` | remote | `forztf/open-skilled-sdd@openspec-context-loading-cn` |
| `skill-name` | inbox | `my-skill` |

#### 3.3 主入口函数重构

**修改前**：
```typescript
async function installSkill(source: string, options: InstallOptions, context: ProgramContext): Promise<void> {
  const scope: InstallScope = options.global ? "global" : "project";
  const isLocal = source.includes("/") || source.includes("\\") || source.includes(path.sep);
  
  if (isLocal) {
    await installLocalSkill(...);
  } else {
    await installInboxSkill(...);
  }
}
```

**修改后**：
```typescript
async function installSkill(source: string, options: InstallOptions, context: ProgramContext): Promise<void> {
  const scope: InstallScope = options.global ? "global" : "space";
  const sourceType = detectSourceType(source);
  
  switch (sourceType) {
    case "local":
      await installLocalSkill(source, scope, options, context);
      break;
    case "remote":
      await installRemoteSkill(source, scope, options, context);
      break;
    case "inbox":
      await installInboxSkill(source, scope, options, context);
      break;
  }
}
```

#### 3.4 新增远程安装函数

```typescript
async function installRemoteSkill(
  source: string,
  scope: InstallScope,
  options: InstallOptions,
  context: ProgramContext,
): Promise<void> {
  const { output, config, debug } = context;
  
  // 解析 owner/repo@skill
  const match = source.match(/^([^/]+)\/([^/@]+)@([^/]+)$/);
  if (!match) {
    throw new Error(`Invalid remote source format: ${source}`);
  }
  const [, owner, repo, skillName] = match;
  
  output.print(`Installing remote skill: ${owner}/${repo}@${skillName}`);
  
  // 1. Download to INBOX
  output.print("Downloading...");
  const inboxDir = config.getSkillsInboxDir();
  const skillDestPath = path.join(inboxDir, skillName);
  
  // 复用 download.ts 的核心逻辑（提取为可复用函数）
  await downloadSkillToInbox(owner!, repo!, skillName!, options.force, context);
  
  // 2. Scan（失败则保留 INBOX）
  if (!options.skipScan) {
    output.print("Running security scan...");
    try {
      const result = await scanSkill(skillDestPath, skillName!, context, false);
      if (result.status === "fail") {
        throw new Error(
          `Security scan failed (risk: ${result.riskScore}, critical: ${result.summary.critical})\n` +
          `Skill preserved in INBOX for manual review`
        );
      }
      output.print(`Security scan passed (risk: ${result.riskScore})`);
    } catch (error) {
      output.print("Skill preserved in INBOX due to scan failure");
      throw error;
    }
  }
  
  // 3. Install
  await installInboxSkill(skillName!, scope, options, context);
}
```

#### 3.5 INBOX 安装函数修改

**修改点 1**：scope 类型值
```diff
- const scope: InstallScope = options.global ? "global" : "project";
+ // scope 由调用方传入，已改为 "space"
```

**修改点 2**：lock 写入
```diff
  const lockManager = new LockManager(config);
- await lockManager.addSkillToBothLocks(skillName, lockEntry);
+ await lockManager.addSkillToLock(skillName, lockEntry, scope);
```

**修改点 3**：INBOX 删除逻辑（函数末尾）
```diff
- await fs.remove(skillDir);
- if (debug) {
-   output.print(`INBOX skill removed: ${skillDir}`);
- }
+ if (options.rmInbox) {
+   await fs.remove(skillDir);
+   if (debug) {
+     output.print(`INBOX skill removed: ${skillDir}`);
+   }
+ }
```

#### 3.6 本地安装函数修改

**修改点 1**：lock 写入
```diff
  const lockManager = new LockManager(config);
- await lockManager.addSkillToBothLocks(skillName, lockEntry);
+ await lockManager.addSkillToLock(skillName, lockEntry, scope);
```

#### 3.7 checkExistingSkill 函数修改

```diff
- const scopeText = scope === "global" ? "global" : "project";
+ const scopeText = scope === "global" ? "global" : "space";
```

#### 3.8 命令定义更新

```typescript
export const installSubcommand: SubCommandDefinition = {
  name: "install <source>",
  description: "Install a skill from INBOX, local path, or remote source",
  options: [
    {
      flags: "-g, --global",
      description: "Install to global scope (~/.wopal/skills/)",
    },
    {
      flags: "--force",
      description: "Force overwrite if skill already exists",
    },
    {
      flags: "--skip-scan",
      description: "Skip security scan",
    },
    {
      flags: "--rm-inbox",
      description: "Remove skill from INBOX after installation",
    },
    {
      flags: "--mode <mode>",
      description: "Install mode (copy or symlink)",
      defaultValue: "copy",
    },
  ],
  // ... action 实现
  helpText: {
    examples: [
      "wopal skills install my-skill                    # Install from INBOX",
      "wopal skills install /path/to/skill             # Install from local path",
      "wopal skills install owner/repo@skill           # Download, scan, install",
      "wopal skills install my-skill --global          # Install globally",
      "wopal skills install my-skill --rm-inbox        # Remove from INBOX after install",
      "wopal skills install owner/repo@skill --rm-inbox # Full auto with cleanup",
    ],
    notes: [
      "Remote format (owner/repo@skill) auto-downloads and scans",
      "INBOX skills are preserved by default, use --rm-inbox to remove",
      "Local paths must be absolute (start with / or drive letter)",
    ],
    workflow: [
      "INBOX: download → scan → install",
      "Remote: auto download + scan + install",
      "Local: direct install",
    ],
  },
};
```

---

### 4. list 命令 (`src/commands/skills/list.ts`)

**修改点**：选项描述和显示文本

```diff
- { flags: "--local", description: "Show only project-level skills" },
+ { flags: "--local", description: "Show only space-level skills" },
```

```diff
- ? "project"
+ ? "space"
```

---

### 5. check 命令 (`src/commands/skills/check.ts`)

**修改点**：选项描述

```diff
- { flags: "--local", description: "Only check project-level skills" },
+ { flags: "--local", description: "Only check space-level skills" },
```

---

### 6. AGENTS.md 文档更新

#### 6.1 命令速查表

```diff
- | `wopal skills install <name>` | `--force` `--skip-scan` `--target` | 安装技能 |
+ | `wopal skills install <source>` | `-g` `--force` `--skip-scan` `--rm-inbox` | 安装技能 |
```

#### 6.2 新增章节（在"关键模块"之后）

```markdown
## 安装源类型

| 格式 | 类型 | 说明 |
|------|------|------|
| `skill-name` | INBOX | 从 INBOX 安装已扫描的技能 |
| `/absolute/path` | 本地 | 本地技能目录（必须绝对路径） |
| `C:\path` | 本地 | Windows 本地路径 |
| `owner/repo@skill` | 远程 | 自动 download → scan → install |

## 安装级别

| 级别 | 目标目录 | Lock 文件 |
|------|----------|-----------|
| space (默认) | `<space>/.wopal/skills/` | `<space>/.wopal/skills/.skill-lock.json` |
| global (`-g`) | `~/.wopal/skills/` | `~/.wopal/skills/.skill-lock.json` |

## 工作流

### 标准流程
```
download → scan → install
```

### 快捷流程
```
wopal skills install owner/repo@skill  # 自动完成三步
```
```

#### 6.3 模块描述更新

```diff
- │   ├── lock-manager.ts    # wopal-skills.lock 管理
+ │   ├── lock-manager.ts    # skill-lock.json 管理（space/global 分离写入）
```

---

## 测试用例修改

### 7. lock-manager.test.ts (`tests/lock-manager.test.ts`)

#### 7.1 移除测试

```diff
- it("should add skill to both locks", async () => {
-   const entry: SkillLockEntry = { ... };
-   await lockManager.addSkillToBothLocks("test-skill", entry);
-   const projectLock = await lockManager.readProjectLock();
-   const globalLock = await lockManager.readGlobalLock();
-   expect(projectLock.skills["test-skill"]).toBeDefined();
-   expect(globalLock.skills["test-skill"]).toBeDefined();
- });
```

#### 7.2 新增测试

```typescript
describe("addSkillToLock (scope-aware)", () => {
  it("should add skill to space lock only when scope is space", async () => {
    const entry: SkillLockEntry = {
      source: "owner/repo",
      sourceType: "github",
      sourceUrl: "https://github.com/owner/repo",
      skillPath: "skills/test",
      skillFolderHash: "abc123",
      installedAt: "2026-03-06T00:00:00.000Z",
      updatedAt: "2026-03-06T00:00:00.000Z",
    };

    await lockManager.addSkillToLock("test-skill", entry, "space");

    const spaceLock = await lockManager.readProjectLock();
    const globalLock = await lockManager.readGlobalLock();

    expect(spaceLock.skills["test-skill"]).toBeDefined();
    expect(spaceLock.skills["test-skill"].source).toBe("owner/repo");
    expect(globalLock.skills["test-skill"]).toBeUndefined();
  });

  it("should add skill to global lock only when scope is global", async () => {
    const entry: SkillLockEntry = {
      source: "owner/repo",
      sourceType: "github",
      sourceUrl: "https://github.com/owner/repo",
      skillPath: "skills/test",
      skillFolderHash: "abc123",
      installedAt: "2026-03-06T00:00:00.000Z",
      updatedAt: "2026-03-06T00:00:00.000Z",
    };

    await lockManager.addSkillToLock("test-skill", entry, "global");

    const spaceLock = await lockManager.readProjectLock();
    const globalLock = await lockManager.readGlobalLock();

    expect(spaceLock.skills["test-skill"]).toBeUndefined();
    expect(globalLock.skills["test-skill"]).toBeDefined();
    expect(globalLock.skills["test-skill"].source).toBe("owner/repo");
  });

  it("should update timestamp when adding skill", async () => {
    const entry: SkillLockEntry = {
      source: "owner/repo",
      sourceType: "github",
      sourceUrl: "https://github.com/owner/repo",
      skillPath: "skills/test",
      skillFolderHash: "abc123",
      installedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const beforeAdd = new Date().toISOString();
    await lockManager.addSkillToLock("test-skill", entry, "space");
    const afterAdd = new Date().toISOString();

    const spaceLock = await lockManager.readProjectLock();
    const updatedAt = spaceLock.skills["test-skill"].updatedAt;

    expect(updatedAt >= beforeAdd).toBe(true);
    expect(updatedAt <= afterAdd).toBe(true);
  });
});
```

---

### 8. integration.test.ts (`tests/integration.test.ts`)

#### 8.1 修改现有测试

**测试 1：`should install skill from INBOX to project-level`**

```diff
- it("should install skill from INBOX to project-level", async () => {
+ it("should install skill from INBOX to space-level and preserve INBOX by default", async () => {
    // ... setup code ...

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

-   // INBOX 中的 skill 应已被移除
-   expect(await fs.pathExists(inboxSkillDir)).toBe(false);
+   // INBOX 中的 skill 应被保留（默认行为）
+   expect(await fs.pathExists(inboxSkillDir)).toBe(true);

    // 锁文件应已更新
    const lockPath = path.join(projectDir, ".wopal", "skills", ".skill-lock.json");
    expect(await fs.pathExists(lockPath)).toBe(true);

    const lock = await fs.readJson(lockPath);
    expect(lock.version).toBe(3);
    expect(lock.skills[skillName]).toBeDefined();
    expect(lock.skills[skillName].source).toBe("owner/repo");
+   
+   // 验证只写入 space lock，未写入 global lock
+   const globalLockPath = path.join(wopalHome, "skills", ".skill-lock.json");
+   if (await fs.pathExists(globalLockPath)) {
+     const globalLock = await fs.readJson(globalLockPath);
+     expect(globalLock.skills[skillName]).toBeUndefined();
+   }
  }, 30000);
```

#### 8.2 新增测试

```typescript
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

  // INBOX 中的 skill 应被删除
  expect(await fs.pathExists(inboxSkillDir)).toBe(false);

  // 安装目录应存在
  const installedDir = path.join(projectDir, ".wopal", "skills", skillName);
  expect(await fs.pathExists(installedDir)).toBe(true);
});

it("should install skill to global scope with -g flag", async () => {
  await setupMockOpenclaw(
    wopalHome,
    `CLEAN: All checks passed`,
    0,
  );

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

  // 应安装到全局目录
  const globalInstalledDir = path.join(wopalHome, "skills", skillName);
  expect(await fs.pathExists(globalInstalledDir)).toBe(true);

  // 不应安装到 space 目录
  const spaceInstalledDir = path.join(projectDir, ".wopal", "skills", skillName);
  expect(await fs.pathExists(spaceInstalledDir)).toBe(false);

  // 只写入 global lock
  const globalLockPath = path.join(wopalHome, "skills", ".skill-lock.json");
  const globalLock = await fs.readJson(globalLockPath);
  expect(globalLock.skills[skillName]).toBeDefined();

  // space lock 不应包含
  const spaceLockPath = path.join(projectDir, ".wopal", "skills", ".skill-lock.json");
  if (await fs.pathExists(spaceLockPath)) {
    const spaceLock = await fs.readJson(spaceLockPath);
    expect(spaceLock.skills[skillName]).toBeUndefined();
  }
});

it("should install remote skill with owner/repo@skill format", async () => {
  // 使用 mock：预先在 INBOX 创建技能，模拟 download 已完成
  await setupMockOpenclaw(
    wopalHome,
    `CLEAN: All checks passed`,
    0,
  );

  const skillSource = "owner/repo@remote-test-skill";
  const skillName = "remote-test-skill";

  // Mock: 预先创建 INBOX 中的技能（模拟 download 结果）
  const inboxSkillDir = path.join(inboxDir, skillName);
  await createTestSkill(inboxSkillDir, skillName);
  await fs.writeJson(path.join(inboxSkillDir, ".source.json"), {
    name: skillName,
    source: skillSource,
    sourceUrl: "https://github.com/owner/repo",
    skillPath: "skills/remote-test-skill",
    downloadedAt: new Date().toISOString(),
    skillFolderHash: "mock-hash-remote",
  });

  // 注入 mock download 函数（测试环境下跳过真实 download）
  // 实际实现时可通过环境变量或依赖注入控制
  const output = execSync(
    `node ${CLI_PATH} skills install ${skillSource} --skip-scan`,
    {
      cwd: projectDir,
      encoding: "utf-8",
      env: { 
        ...process.env,
        WOPAL_MOCK_DOWNLOAD: "true",  // mock 标志
      },
    },
  );

  expect(output).toContain("Installing remote skill");
  expect(output).toContain("Installation complete");

  // 验证安装到 space 目录
  const installedDir = path.join(projectDir, ".wopal", "skills", skillName);
  expect(await fs.pathExists(installedDir)).toBe(true);

  // INBOX 应保留（默认行为）
  expect(await fs.pathExists(inboxSkillDir)).toBe(true);
});

it("should preserve INBOX when scan fails during remote install", async () => {
  // Mock scan 失败
  await setupMockOpenclaw(
    wopalHome,
    `[1/3] Check malware
CRITICAL: Malware detected`,
    2, // exit code 2 = COMPROMISED
  );

  const skillSource = "owner/repo@scan-fail-skill";
  const skillName = "scan-fail-skill";

  // Mock: 预先创建 INBOX 中的技能（模拟 download 结果）
  const inboxSkillDir = path.join(inboxDir, skillName);
  await createTestSkill(inboxSkillDir, skillName);
  await fs.writeJson(path.join(inboxSkillDir, ".source.json"), {
    name: skillName,
    source: skillSource,
    sourceUrl: "https://github.com/owner/repo",
    skillPath: "skills/scan-fail-skill",
    downloadedAt: new Date().toISOString(),
    skillFolderHash: "mock-hash-scan-fail",
  });

  try {
    execSync(
      `node ${CLI_PATH} skills install ${skillSource}`,
      {
        cwd: projectDir,
        encoding: "utf-8",
        env: { 
          ...process.env,
          WOPAL_MOCK_DOWNLOAD: "true",
        },
        stdio: "pipe",
      },
    );
    expect.fail("Should have thrown an error due to scan failure");
  } catch (error: any) {
    const message = `${error.stdout || ""}${error.stderr || ""}`;
    expect(message).toContain("Security scan failed");
  }

  // INBOX 应保留（scan 失败时）
  expect(await fs.pathExists(inboxSkillDir)).toBe(true);

  // 不应安装到目标目录
  const installedDir = path.join(projectDir, ".wopal", "skills", skillName);
  expect(await fs.pathExists(installedDir)).toBe(false);
});

it("should reject invalid remote source format", async () => {
  try {
    execSync(
      `node ${CLI_PATH} skills install invalid-format`,
      {
        cwd: projectDir,
        encoding: "utf-8",
        env: { ...process.env },
        stdio: "pipe",
      },
    );
    expect.fail("Should have thrown an error");
  } catch (error: any) {
    const message = `${error.stdout || ""}${error.stderr || ""}`;
    expect(message).toContain("not found in INBOX");
  }
});
```

  try {
    execSync(
      `node ${CLI_PATH} skills install ${skillSource}`,
      {
        cwd: projectDir,
        encoding: "utf-8",
        env: { 
          ...process.env,
          WOPAL_MOCK_DOWNLOAD: "true",
        },
        stdio: "pipe",
      },
    );
    expect.fail("Should have thrown an error due to scan failure");
  } catch (error: any) {
    const message = `${error.stdout || ""}${error.stderr || ""}`;
    expect(message).toContain("Security scan failed");
  }

  // INBOX 应保留（scan 失败时）
  expect(await fs.pathExists(inboxSkillDir)).toBe(true);

  // 不应安装到目标目录
  const installedDir = path.join(projectDir, ".wopal", "skills", skillName);
  expect(await fs.pathExists(installedDir)).toBe(false);
});

it("should reject invalid remote source format", async () => {
  try {
    execSync(
      `node ${CLI_PATH} skills install invalid-format`,
      {
        cwd: projectDir,
        encoding: "utf-8",
        env: { ...process.env },
        stdio: "pipe",
      },
    );
    expect.fail("Should have thrown an error");
  } catch (error: any) {
    const message = `${error.stdout || ""}${error.stderr || ""}`;
    expect(message).toContain("not found in INBOX");
  }
});
```

#### 8.3 新增 detectSourceType 单元测试

```typescript
// 新增测试文件或添加到 integration.test.ts

describe("detectSourceType", () => {
  // 需要导出 detectSourceType 函数进行测试
  
  it("should detect local path starting with /", () => {
    expect(detectSourceType("/home/user/skill")).toBe("local");
    expect(detectSourceType("/usr/local/skills/my-skill")).toBe("local");
  });

  it("should detect local Windows path with drive letter", () => {
    expect(detectSourceType("C:\\Users\\skill")).toBe("local");
    expect(detectSourceType("D:\\skills\\my-skill")).toBe("local");
    expect(detectSourceType("C:/Users/skill")).toBe("local");
  });

  it("should detect remote source with owner/repo@skill format", () => {
    expect(detectSourceType("owner/repo@skill")).toBe("remote");
    expect(detectSourceType("forztf/open-skilled-sdd@openspec-context-loading")).toBe("remote");
    expect(detectSourceType("a/b@c")).toBe("remote");
  });

  it("should detect inbox skill name", () => {
    expect(detectSourceType("my-skill")).toBe("inbox");
    expect(detectSourceType("skill_name")).toBe("inbox");
    expect(detectSourceType("simple")).toBe("inbox");
  });

  it("should NOT detect relative path as local", () => {
    // 相对路径应被视为 inbox 技能名
    expect(detectSourceType("./skill")).toBe("inbox");
    expect(detectSourceType("../skill")).toBe("inbox");
  });
});
```

---

## 测试场景

| # | 命令 | 预期结果 |
|---|------|----------|
| 1 | `wopal skills install my-skill` | INBOX 保留，只写 space lock |
| 2 | `wopal skills install my-skill --rm-inbox` | INBOX 删除，只写 space lock |
| 3 | `wopal skills install my-skill -g` | 安装到全局，只写 global lock |
| 4 | `wopal skills install my-skill -g --rm-inbox` | 安装到全局，删除 INBOX，只写 global lock |
| 5 | `wopal skills install /abs/path` | 本地安装，只写 space lock |
| 6 | `wopal skills install owner/repo@skill` | 自动 download + scan + install，INBOX 保留 |
| 7 | `wopal skills install owner/repo@skill --rm-inbox` | 自动安装，INBOX 删除 |
| 8 | `wopal skills install owner/repo@skill` (scan 失败) | INBOX 保留，安装中止，报错 |
| 9 | `wopal skills list --local` | 显示 "space-level" |
| 10 | `wopal skills check --local` | 检查 "space-level" |

---

## 实施步骤

1. **类型定义**：修改 `src/types/lock.ts`
2. **Lock 管理器**：修改 `src/lib/lock-manager.ts`
3. **install 命令**：修改 `src/commands/skills/install.ts`
4. **list/check 命令**：修改文案
5. **测试用例**：
   - 修改 `tests/lock-manager.test.ts`：移除 `addSkillToBothLocks` 测试，新增 `addSkillToLock` 测试
   - 修改 `tests/integration.test.ts`：更新现有测试（INBOX 保留、lock 分离），新增远程安装测试
6. **文档**：更新 `AGENTS.md`
7. **运行测试**：`pnpm test:run`
8. **格式化**：`pnpm format`

---

## 风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 破坏现有 lock 文件格式 | 低 | 仅修改写入逻辑，格式不变 |
| 远程安装失败处理 | 中 | 失败时保留 INBOX，用户可手动处理 |
| 类型值变更影响其他代码 | 低 | 已检查所有 `"project"` 引用 |

---

## 设计决策

1. **download 复用**：提取为 `lib/download-skill.ts` 供 download.ts 和 install.ts 共同调用
2. **远程安装的 ref 支持**：暂不支持 `--branch`，用户可先用 download 再 install
3. **测试中的远程安装**：使用 mock download 逻辑，保证测试稳定性
4. **detectSourceType 导出**：不导出，通过集成测试间接覆盖
