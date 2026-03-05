import pc from 'picocolors';
import { getInboxDir } from '../utils/inbox-utils.js';
import { collectSkills, getInstalledSkillsDir, mergeSkills } from '../utils/skill-utils.js';
let logger;
export function setLogger(l) {
    logger = l;
}
export function registerListCommand(program) {
    program
        .command('list')
        .description('List all skills (INBOX downloaded + installed)')
        .option('-i, --info', 'Show skill descriptions')
        .action(async (options) => {
        await listSkills(options.info || false);
    });
}
async function listSkills(showInfo) {
    const inboxDir = getInboxDir();
    const installedDir = getInstalledSkillsDir();
    logger?.log(`Listing skills from INBOX: ${inboxDir}`);
    logger?.log(`Listing skills from installed: ${installedDir}`);
    const inboxSkills = collectSkills(inboxDir, 'downloaded');
    const installedSkills = collectSkills(installedDir, 'installed');
    const allSkills = mergeSkills(inboxSkills, installedSkills);
    if (allSkills.length === 0) {
        console.log(pc.yellow('没有找到任何技能'));
        return;
    }
    console.log(pc.bold('技能列表：\n'));
    for (const skill of allSkills) {
        const statusIcon = skill.status === 'downloaded' ? pc.yellow('[已下载]') : pc.green('[已安装]');
        console.log(`  ${statusIcon} ${pc.cyan(skill.name)}`);
        if (showInfo) {
            if (skill.description) {
                console.log(`           ${pc.dim(skill.description)}`);
            }
            console.log(`           ${pc.dim(`路径: ${skill.path}`)}`);
        }
    }
}
//# sourceMappingURL=list.js.map