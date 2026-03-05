import { existsSync, rmSync, readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import pc from 'picocolors';
import { getInboxDir, getDirectorySize, formatSize, buildDirectoryTree } from '../utils/inbox-utils.js';
let logger;
export function setLogger(l) {
    logger = l;
}
export function registerInboxCommand(program) {
    const inbox = program
        .command('inbox')
        .description('Manage skills in INBOX (downloaded but not yet installed)');
    inbox
        .command('list')
        .description('List all skills in INBOX')
        .action(async () => {
        await listInboxSkills();
    });
    inbox
        .command('show <skill>')
        .description('Show skill details (SKILL.md content and directory structure)')
        .action(async (skillName) => {
        await showInboxSkill(skillName);
    });
    inbox
        .command('remove <skill>')
        .description('Remove a single skill from INBOX')
        .action(async (skillName) => {
        await removeInboxSkill(skillName);
    });
}
async function listInboxSkills() {
    const inboxDir = getInboxDir();
    logger?.log(`Listing INBOX skills from: ${inboxDir}`);
    if (!existsSync(inboxDir)) {
        console.log(pc.yellow('INBOX 为空'));
        return;
    }
    const entries = existsSync(inboxDir) ? readdirSync(inboxDir) : [];
    const skills = entries.filter((entry) => {
        return statSync(join(inboxDir, entry)).isDirectory();
    });
    if (skills.length === 0) {
        console.log(pc.yellow('INBOX 为空'));
        return;
    }
    console.log(pc.bold('INBOX 技能列表：\n'));
    for (const skill of skills) {
        const skillPath = join(inboxDir, skill);
        const size = getDirectorySize(skillPath);
        console.log(`  ${pc.cyan(skill)} ${pc.dim(`(${formatSize(size)})`)}`);
    }
}
async function showInboxSkill(skillName) {
    const inboxDir = getInboxDir();
    const skillDir = join(inboxDir, skillName);
    const skillMdPath = join(skillDir, 'SKILL.md');
    logger?.log(`Showing skill: ${skillName} at ${skillDir}`);
    if (!existsSync(skillDir)) {
        console.error(pc.red(`技能 ${skillName} 不存在`));
        process.exit(1);
    }
    if (!existsSync(skillMdPath)) {
        console.warn(pc.yellow('无效的技能目录（缺少 SKILL.md）'));
        return;
    }
    const content = readFileSync(skillMdPath, 'utf-8');
    console.log(content);
    console.log(pc.bold('\n目录结构：'));
    const tree = buildDirectoryTree(skillDir);
    console.log(tree);
}
async function removeInboxSkill(skillName) {
    const inboxDir = getInboxDir();
    const skillDir = join(inboxDir, skillName);
    logger?.log(`Removing skill: ${skillName} from ${skillDir}`);
    if (!existsSync(skillDir)) {
        console.error(pc.red(`技能 ${skillName} 不存在`));
        process.exit(1);
    }
    rmSync(skillDir, { recursive: true, force: true });
    console.log(pc.green(`已删除技能：${skillName}`));
}
//# sourceMappingURL=inbox.js.map