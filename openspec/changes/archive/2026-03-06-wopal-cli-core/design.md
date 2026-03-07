## Context

Skills CLI 官方工具不支持 INBOX 隔离工作流，直接将技能安装到 agent 目录。我们需要构建一个独立的 CLI 工具 **wopal-cli**，借鉴 Skills CLI 的技术栈和架构，实现完整的"下载 → 扫描 → 评估 → 安装"工作流。

**wopal-cli-core** 是 wopal-cli 的核心基础设施，为后续所有命令提供底层支持。

### 技术栈参考

Skills CLI (`playground/_good_repos/skills/`) 使用以下技术栈：
- **TypeScript 5.9** + ES modules
- **obuild** 构建工具（零配置打包）
- **picocolors** 终端颜色（轻量级，~1KB）
- **gray-matter** Markdown frontmatter 解析
- **simple-git** Git 操作封装
- **xdg-basedir** 跨平台目录路径

### 当前状态

- ✅ 已完成 proposal 和 specs
- ⏳ 需要创建 wopal-cli 项目结构
- ⏳ 需要实现 CLI 框架、INBOX 管理、透传命令

### 约束条件

1. **技术栈灵活**：使用 TypeScript + ES modules，可选用 CLI 框架（commander.js/yargs）简化实现
2. **完全独立**：不依赖外部 CLI（npx skills），核心功能内置实现
3. **INBOX 隔离**：提供临时隔离区，支持安全工作流
4. **透传兼容**：保留透传功能，方便用户从 Skills CLI 迁移
5. **AI Agent 友好**：帮助信息格式清晰，适合 AI agent 阅读

## Goals / Non-Goals

**Goals:**

1. **CLI 框架搭建**
   - 实现 `wopal skills` 主命令入口
   - 实现完整帮助系统（`--help/-h`、子命令帮助）
   - 实现版本显示（`--version`）
   - 实现调试模式（`--debug/-d`）
   - 实现环境变量加载（默认 `~/.wopal/.env`，调试模式 `cwd/.env`）

2. **INBOX 管理**
   - 实现 `wopal skills inbox list` 命令（列出 INBOX 技能）
   - 实现 `wopal skills inbox show <skill>` 命令（显示技能详情）
   - 实现 `wopal skills inbox remove <skill>` 命令（删除单个技能）
   - 实现环境变量 `SKILL_INBOX_DIR` 配置（默认 `~/.wopal/skills/INBOX`）

3. **技能列表管理**
   - 实现 `wopal skills list` 命令（显示所有技能：INBOX 已下载 + 已安装）
   - 实现 `--info` 参数（显示技能 description）
   - 区分显示技能状态（已下载/已安装）

4. **透传命令**
   - 实现 `wopal skills find` 透传到 Skills CLI
   - 保持 Skills CLI 的原始输出

**Non-Goals:**

1. **下载功能**（wopal-cli-download 变更）
   - 不实现 `wopal skills download` 命令
   - 不复制 Skills CLI 的 git.ts、source-parser.ts

2. **扫描功能**（wopal-cli-scan 变更）
   - 不实现安全扫描
   - 不加载 IOC 数据库

3. **安装功能**（wopal-cli-install 变更）
   - 不实现技能安装
   - 不管理锁文件

4. **检查和更新功能**（wopal-cli-check、wopal-cli-update 变更）
   - 不实现版本检查
   - 不实现技能更新

## Decisions

### 1. CLI 框架架构

**决策**：可选用 CLI 框架（commander.js/yargs）简化实现，或手动实现命令路由

**实现方式（使用 commander.js）**：
- `src/cli.ts`：主入口，使用 commander.js 注册命令
- `src/commands/`：各子命令实现
  - `inbox.ts`：INBOX 管理命令
  - `list.ts`：技能列表命令
  - `passthrough.ts`：透传命令
- `src/utils/`：工具函数
  - `env-loader.ts`：环境变量加载
  - `logger.ts`：日志工具（调试模式输出到 cwd/logs/）
  - `inbox-utils.ts`：INBOX 工具函数
  - `skill-utils.ts`：技能工具函数

**原因**：
- commander.js 提供完整的帮助系统、参数解析、子命令支持
- 减少样板代码，提高开发效率
- 社区成熟，文档完善

**替代方案**：
- 手动实现命令路由（switch/case）→ 可选（更轻量，与 Skills CLI 一致）
- 使用 yargs → 可选（功能类似）

### 2. 环境变量加载策略

**决策**：默认加载 `~/.wopal/.env`，调试模式加载 `cwd/.env`

**实现方式**：
```typescript
// src/utils/env-loader.ts
export function loadEnv(debug: boolean = false): void {
  const envPath = debug 
    ? join(process.cwd(), '.env')
    : join(homedir(), '.wopal', '.env');
  
  if (existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.error('Failed to load .env:', result.error);
    }
  }
}
```

**原因**：
- 默认配置集中管理（`~/.wopal/.env`）
- 调试模式支持项目级配置（`cwd/.env`）
- 与 Skills CLI 的环境变量策略一致

**替代方案**：
- 只使用 `~/.wopal/.env` → 放弃（调试不便）
- 只使用 `cwd/.env` → 放弃（配置分散）

### 3. INBOX 路径配置

**决策**：通过环境变量 `SKILL_INBOX_DIR` 配置，提供默认路径

**实现方式**：
```typescript
// src/utils/inbox-utils.ts
export function getInboxDir(): string {
  return process.env.SKILL_INBOX_DIR || 
    join(homedir(), '.wopal', 'skills', 'INBOX');
}
```

**默认路径**：
```
~/.wopal/skills/INBOX
```

**原因**：
- 环境变量灵活，支持不同环境
- 提供通用的默认路径，不依赖特定工作目录
- 与 wopal 工具的配置目录一致（~/.wopal/）

**替代方案**：
- 固定路径 → 放弃（不灵活）
- 命令行参数 → 放弃（增加复杂度）
- 原路径（~/coding/wopal/...）→ 放弃（过于具体，不通用）

### 4. 帮助系统设计

**决策**：实现完整帮助系统，适合 AI agent 阅读

**实现方式**：
```typescript
// src/cli.ts
function showHelp(): void {
  console.log(`
${BOLD}Usage:${RESET} wopal skills <command> [options]

${BOLD}INBOX Commands:${RESET}
  inbox list                List all skills in INBOX
  inbox show <skill>        Show skill details
  inbox remove <skill>      Remove skill from INBOX

${BOLD}Passthrough Commands:${RESET}
  find [query]              Search for skills (via Skills CLI)
  list                      List installed skills (via Skills CLI)

${BOLD}Options:${RESET}
  --help, -h                Show this help message
  --version, -v             Show version number
  --debug, -d               Enable debug mode

${BOLD}Environment Variables:${RESET}
  WOPAL_SKILLS_INBOX_DIR    INBOX directory path (default: ~/coding/wopal/...)
  
${BOLD}Examples:${RESET}
  wopal skills inbox list
  wopal skills inbox show my-skill
  wopal skills inbox remove my-skill
  wopal skills find typescript
  wopal skills list
`);
}
```

**子命令帮助**：
```typescript
function showInboxHelp(): void {
  console.log(`
${BOLD}Usage:${RESET} wopal skills inbox <subcommand> [options]

${BOLD}Subcommands:${RESET}
  list                      List all skills in INBOX
  show <skill>              Show skill details (SKILL.md content)
  remove <skill>            Remove a single skill from INBOX

${BOLD}Examples:${RESET}
  wopal skills inbox list
  wopal skills inbox show my-skill
  wopal skills inbox remove my-skill
`);
}
```

**原因**：
- 帮助信息结构清晰，易于 AI agent 解析
- 包含所有命令、选项、环境变量、示例
- 与 Skills CLI 的帮助风格一致

**替代方案**：
- 简短帮助 → 放弃（不适合 AI agent）
- 动态生成帮助 → 放弃（增加复杂度）

### 5. 调试模式设计

**决策**：`--debug/-d` 参数启用调试模式，输出日志到 `cwd/logs/`

**实现方式**：
```typescript
// src/utils/logger.ts
export class Logger {
  private debug: boolean;
  private logDir: string;

  constructor(debug: boolean = false) {
    this.debug = debug;
    this.logDir = join(process.cwd(), 'logs');
  }

  log(message: string): void {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    
    if (this.debug) {
      // 调试模式：输出到控制台和日志文件
      console.log(logLine);
      appendFileSync(join(this.logDir, 'wopal-cli.log'), logLine);
    }
    // 正常模式：静默（不输出）
  }
}
```

**原因**：
- 调试模式帮助开发排查问题
- 日志文件持久化，便于事后分析
- 正常模式静默，不干扰用户

**替代方案**：
- 总是输出日志 → 放弃（性能影响）
- 不支持调试模式 → 放弃（难以排查问题）

### 6. INBOX 管理命令设计

**决策**：实现 3 个 INBOX 管理命令（list、show、remove）

**实现方式**：

**`inbox list`**：
```typescript
// src/commands/inbox.ts
export async function listInboxSkills(): Promise<void> {
  const inboxDir = getInboxDir();
  
  if (!existsSync(inboxDir)) {
    console.log('INBOX 为空');
    return;
  }

  const skills = readdirSync(inboxDir).filter(dir => {
    return statSync(join(inboxDir, dir)).isDirectory();
  });

  if (skills.length === 0) {
    console.log('INBOX 为空');
    return;
  }

  console.log('INBOX 技能列表：');
  for (const skill of skills) {
    const skillPath = join(inboxDir, skill);
    const size = getDirectorySize(skillPath);
    console.log(`  ${skill} (${formatSize(size)})`);
  }
}
```

**`inbox show`**：
```typescript
export async function showInboxSkill(skillName: string): Promise<void> {
  const skillDir = join(getInboxDir(), skillName);
  const skillMdPath = join(skillDir, 'SKILL.md');

  if (!existsSync(skillDir)) {
    console.error(`技能 ${skillName} 不存在`);
    process.exit(1);
  }

  if (!existsSync(skillMdPath)) {
    console.warn('无效的技能目录（缺少 SKILL.md）');
    return;
  }

  const content = readFileSync(skillMdPath, 'utf-8');
  console.log(content);
  
  // 显示目录结构
  console.log('\n目录结构：');
  const tree = buildDirectoryTree(skillDir);
  console.log(tree);
}
```

**`inbox remove`**：
```typescript
export async function removeInboxSkill(skillName: string): Promise<void> {
  const skillDir = join(getInboxDir(), skillName);

  if (!existsSync(skillDir)) {
    console.error(`技能 ${skillName} 不存在`);
    process.exit(1);
  }

  // 删除技能目录
  rmSync(skillDir, { recursive: true, force: true });
  console.log(`已删除技能：${skillName}`);
  
  // 保留 INBOX 目录本身
}
```

**原因**：
- list：快速查看 INBOX 内容
- show：详细查看技能信息（SKILL.md）
- remove：安装完成后清理单个技能

**替代方案**：
- 实现 `inbox clean` 批量删除 → 放弃（移至 wopal-cli-install，安装后自动清理）
- 实现 `inbox install` → 放弃（属于 wopal-cli-install 变更）

### 7. 技能列表管理命令设计

**决策**：实现 `wopal skills list` 命令，显示所有技能（INBOX 已下载 + 已安装）

**实现方式**：

**`list` 命令**：
```typescript
// src/commands/list.ts
export async function listSkills(showInfo: boolean = false): Promise<void> {
  const inboxDir = getInboxDir();
  const installedDir = getInstalledSkillsDir();
  
  // 收集 INBOX 中已下载的技能
  const inboxSkills = await collectSkills(inboxDir, 'downloaded');
  
  // 收集已安装的技能
  const installedSkills = await collectSkills(installedDir, 'installed');
  
  // 合并并去重
  const allSkills = mergeSkills(inboxSkills, installedSkills);
  
  if (allSkills.length === 0) {
    console.log('没有找到任何技能');
    return;
  }
  
  // 显示技能列表
  console.log('技能列表：\n');
  for (const skill of allSkills) {
    const status = skill.status === 'downloaded' ? '[已下载]' : '[已安装]';
    console.log(`  ${status} ${skill.name}`);
    
    if (showInfo && skill.description) {
      console.log(`           ${skill.description}`);
    }
    
    if (showInfo) {
      console.log(`           路径: ${skill.path}`);
    }
  }
}

interface Skill {
  name: string;
  description?: string;
  path: string;
  status: 'downloaded' | 'installed';
}
```

**`--info` 参数**：
```typescript
// src/commands/list.ts
export function parseListOptions(args: string[]): { showInfo: boolean } {
  return {
    showInfo: args.includes('--info') || args.includes('-i')
  };
}
```

**原因**：
- 统一显示所有技能，方便用户查看
- 区分已下载和已安装状态
- `--info` 参数提供详细信息，不干扰简洁输出

**替代方案**：
- 分离 `list-inbox` 和 `list-installed` → 放弃（用户需要运行两个命令）
- 透传到 Skills CLI → 放弃（无法显示 INBOX 技能）

### 8. 透传命令设计

**决策**：透传 find 命令到 Skills CLI，保持原始输出

**实现方式**：
```typescript
// src/commands/passthrough.ts
export async function passthroughFind(query: string): Promise<void> {
  const result = spawnSync('npx', ['-y', 'skills', 'find', query], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    console.error('Skills CLI 执行失败');
    process.exit(result.status || 1);
  }
}
```

**原因**：
- 透传功能方便用户从 Skills CLI 迁移
- 保持 Skills CLI 的原始输出，不修改
- 不影响 wopal skills 锁文件

**替代方案**：
- 重新实现 find → 放弃（重复造轮子）
- 不提供透传功能 → 放弃（迁移体验差）

### 9. 项目结构设计

**决策**：在 `projects/agent-tools/tools/wopal-cli/` 创建独立项目

**目录结构**：
```
projects/agent-tools/tools/wopal-cli/
├── src/
│   ├── cli.ts                    # CLI 入口
│   ├── commands/
│   │   ├── inbox.ts              # INBOX 管理命令
│   │   ├── list.ts               # 技能列表命令
│   │   └── passthrough.ts        # 透传命令
│   └── utils/
│       ├── env-loader.ts         # 环境变量加载
│       ├── logger.ts             # 日志工具
│       ├── inbox-utils.ts        # INBOX 工具函数
│       └── skill-utils.ts        # 技能工具函数（读取 SKILL.md）
├── bin/
│   └── cli.mjs                   # 可执行文件（构建生成）
├── package.json
└── tsconfig.json
```

**package.json**（使用 commander.js）：
```json
{
  "name": "wopal-cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "wopal": "./bin/cli.mjs"
  },
  "scripts": {
    "build": "tsc && chmod +x bin/cli.mjs",
    "dev": "node src/cli.ts"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "picocolors": "^1.1.1",
    "gray-matter": "^4.0.3",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.9.3"
  }
}
```

**原因**：
- 独立项目，便于版本管理和发布
- commander.js 提供完整的 CLI 功能，减少样板代码
- TypeScript 提供类型安全

**替代方案**：
- 集成到 agent-tools 主项目 → 放弃（耦合度高）
- 使用 obuild 构建 → 可选（更轻量）
- 手动实现 CLI 框架 → 可选（更灵活）

## Risks / Trade-offs

### Risk 1: 透传命令依赖外部 CLI

**风险**：透传功能依赖 `npx skills`，如果 Skills CLI 不可用或网络问题会导致失败

**缓解措施**：
- 在帮助信息中明确说明透传功能依赖 Skills CLI
- 提供友好的错误提示
- 未来考虑实现原生的 find 和 list 功能

### Risk 2: INBOX 路径默认值过于具体

**风险**：默认 INBOX 路径包含具体的用户名和工作目录，可能不适用于所有环境

**缓解措施**：
- 文档中明确说明环境变量配置方式
- 在首次运行时检测并提示用户配置
- 提供配置向导（未来）

### Risk 3: 调试模式日志文件可能占用磁盘空间

**风险**：长时间运行调试模式可能产生大量日志文件

**缓解措施**：
- 日志文件按日期滚动
- 提供日志清理命令（未来）
- 文档中说明调试模式的使用场景

### Trade-off 1: 使用 CLI 框架 vs 手动实现

**权衡**：使用 commander.js 而非手动实现命令路由

**优势**：
- 自动生成帮助系统
- 参数解析完善
- 子命令支持开箱即用
- 社区成熟，文档完善

**劣势**：
- 增加依赖（~50KB）
- 不与 Skills CLI 保持一致

**决策**：选择使用 commander.js，优先开发效率

### Trade-off 2: INBOX 默认路径

**权衡**：使用通用路径 `~/.wopal/skills/INBOX` 而非特定工作目录

**优势**：
- 适用于所有环境，不依赖特定工作目录
- 与 wopal 工具配置目录一致
- 易于用户理解和配置

**劣势**：
- 需要用户创建目录或自动创建
- 可能与现有工作流冲突

**决策**：选择通用路径，提供更好的可移植性

### Trade-off 3: INBOX 管理命令精简

**权衡**：只实现 list、show、remove，不实现 clean 批量删除

**优势**：
- 保持命令职责单一
- 避免误删多个技能
- 符合"安装后删除单个技能"的工作流

**劣势**：
- 批量删除需要手动执行多次 remove
- 清理 INBOX 不够便捷

**决策**：保持精简，clean 功能移至 wopal-cli-install（安装后自动清理）
