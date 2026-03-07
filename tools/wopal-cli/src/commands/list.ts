import { existsSync } from 'fs';
import { Command } from 'commander';
import pc from 'picocolors';
import { getInboxDir } from '../utils/inbox-utils.js';
import { collectSkills, getInstalledSkillsDir, mergeSkills, SkillInfo } from '../utils/skill-utils.js';
import { Logger } from '../utils/logger.js';
import { LockManager } from '../utils/lock-manager.js';
import type { SkillLockEntry } from '../types/lock.js';

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

interface ListOptions {
  info?: boolean;
  local?: boolean;
  global?: boolean;
}

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List all skills (INBOX downloaded + installed from lock files)')
    .option('-i, --info', 'Show skill descriptions and details')
    .option('--local', 'Show only project-level skills')
    .option('--global', 'Show only global-level skills')
    .action(async (options: ListOptions) => {
      await listSkills(options);
    });
}

async function listSkills(options: ListOptions): Promise<void> {
  if (options.local || options.global) {
    await listInstalledSkills(options);
  } else {
    await listAllSkills(options.info || false);
  }
}

async function listAllSkills(showInfo: boolean): Promise<void> {
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

async function listInstalledSkills(options: ListOptions): Promise<void> {
  const lockManager = new LockManager();
  
  const projectLock = await lockManager.readProjectLock();
  const globalLock = await lockManager.readGlobalLock();

  const projectSkills = Object.entries(projectLock.skills);
  const globalSkills = Object.entries(globalLock.skills);

  let skillsToShow: Array<[string, SkillLockEntry]> = [];

  if (options.local && options.global) {
    skillsToShow = [...projectSkills, ...globalSkills];
  } else if (options.local) {
    skillsToShow = projectSkills;
  } else if (options.global) {
    skillsToShow = globalSkills;
  }

  if (skillsToShow.length === 0) {
    console.log(pc.yellow('没有找到已安装的技能'));
    return;
  }

  console.log(pc.bold('已安装技能列表：\n'));

  for (const [skillName, entry] of skillsToShow) {
    const scope = options.local && options.global
      ? (projectSkills.some(([name]) => name === skillName) ? '[项目级]' : '[全局级]')
      : (options.local ? '[项目级]' : '[全局级]');
    
    console.log(`  ${pc.green(scope)} ${pc.cyan(skillName)}`);
    
    if (options.info) {
      console.log(`           ${pc.dim(`源头: ${entry.source}`)}`);
      console.log(`           ${pc.dim(`类型: ${entry.sourceType}`)}`);
      console.log(`           ${pc.dim(`安装时间: ${entry.installedAt}`)}`);
      console.log(`           ${pc.dim(`更新时间: ${entry.updatedAt}`)}`);
      if (entry.skillFolderHash) {
        console.log(`           ${pc.dim(`版本指纹: ${entry.skillFolderHash.substring(0, 16)}...`)}`);
      }
    }
  }
}
