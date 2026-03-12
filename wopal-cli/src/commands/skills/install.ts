import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Logger } from '../../lib/logger.js';
import { LockManager } from '../../lib/lock-manager.js';
import { getInboxDir } from '../../lib/inbox-utils.js';
import { readMetadata } from '../../lib/metadata.js';
import { fetchSkillFolderHash, getGitHubToken } from '../../lib/skill-lock.js';
import { computeSkillFolderHash } from '../../lib/hash.js';
import { scanSkill } from '../../scanner/scanner.js';
import type {
  SkillLockEntry,
  InstallMode,
  InstallScope,
} from '../../types/lock.js';
import { getConfig } from '../../lib/config.js';
import { buildHelpText } from '../../lib/help-texts.js';

interface InstallOptions {
  global: boolean;
  force: boolean;
  skipScan: boolean;
  mode: InstallMode;
  debug: boolean;
}

export function createInstallCommand(): Command {
  const command = new Command('install');

  command
    .description('Install a skill from INBOX or local path')
    .argument('<source>', 'Skill name (for INBOX) or local path')
    .option(
      '-g, --global',
      'Install to global scope (~/.agents/skills/)',
      false,
    )
    .option('--force', 'Force overwrite if skill already exists', false)
    .option('--skip-scan', 'Skip security scan for INBOX skills', false)
    .option('--mode <mode>', 'Install mode (copy or symlink)', 'copy')
    .option('-d, --debug', 'Enable debug logging', false)
    .action(async (source: string, options: InstallOptions) => {
      const logger = new Logger(options.debug);

      try {
        await installSkill(source, options, logger);
      } catch (error) {
        logger.error(
          `Installation failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    });

  command.addHelpText(
    'after',
    buildHelpText({
      examples: [
        '# Install from INBOX (after scanning)\nwopal skills install my-skill',
        '# Install from local path\nwopal skills install /path/to/my-skill',
        '# Install globally\nwopal skills install my-skill --global',
        '# Force overwrite existing\nwopal skills install my-skill --force',
        '# Skip security scan (not recommended)\nwopal skills install my-skill --skip-scan',
      ],
      options: [
        '-g, --global        Install to global scope (~/.agents/skills/)',
        '--force             Force overwrite if skill already exists',
        '--skip-scan         Skip security scan for INBOX skills',
        '--mode <mode>       Install mode (copy or symlink, default: copy)',
        '-d, --debug         Enable debug logging',
        '--help              Show this help message',
      ],
      notes: [
        'INBOX skills are automatically scanned for security issues',
        'Local skills are identified by path separators (/ or \\)',
        'Lock files are updated with skill metadata',
        'INBOX skills are removed after successful installation',
      ],
      workflow: [
        'Download skill: wopal skills download <source>',
        'Scan for issues: wopal skills scan <skill-name>',
        'Install skill: wopal skills install <skill-name>',
        'Verify installation: wopal skills list',
      ],
    }),
  );

  return command;
}

async function installSkill(
  source: string,
  options: InstallOptions,
  logger: Logger,
): Promise<void> {
  logger.debug(`Installing skill from: ${source}`);
  logger.debug(`Options: ${JSON.stringify(options)}`);

  if (options.mode === 'symlink') {
    throw new Error('symlink mode is not implemented yet');
  }

  const scope: InstallScope = options.global ? 'global' : 'project';
  logger.debug(`Install scope: ${scope}`);

  const isLocal =
    source.includes('/') || source.includes('\\') || source.includes(path.sep);

  if (isLocal) {
    await installLocalSkill(source, scope, options, logger);
  } else {
    await installInboxSkill(source, scope, options, logger);
  }
}

async function installLocalSkill(
  skillPath: string,
  scope: InstallScope,
  options: InstallOptions,
  logger: Logger,
): Promise<void> {
  const absolutePath = path.resolve(skillPath);
  logger.debug(`Resolved local path: ${absolutePath}`);

  if (!(await fs.pathExists(absolutePath))) {
    throw new Error(`Local skill path not found: ${absolutePath}`);
  }

  const skillMdPath = path.join(absolutePath, 'SKILL.md');
  if (!(await fs.pathExists(skillMdPath))) {
    throw new Error(`SKILL.md not found in: ${absolutePath}`);
  }

  const skillName = path.basename(absolutePath);
  logger.info(`Installing local skill: ${skillName}`);

  const targetDir = getTargetDir(skillName, scope);
  logger.debug(`Target directory: ${targetDir}`);

  await checkExistingSkill(skillName, targetDir, options.force, scope, logger);

  const skillFolderHash = await computeSkillFolderHash(absolutePath);
  logger.debug(`Computed skill folder hash: ${skillFolderHash}`);

  await copySkill(absolutePath, targetDir, logger);
  console.log(`✓ Skill copied to: ${targetDir}`);

  const lockEntry: SkillLockEntry = {
    source: `my-skills/${skillName}`,
    sourceType: 'local',
    sourceUrl: absolutePath,
    skillPath: absolutePath,
    skillFolderHash,
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const lockManager = new LockManager(getConfig());
  await lockManager.addSkillToBothLocks(skillName, lockEntry);
  console.log('✓ Lock files updated');

  console.log(`✓ Installation complete: ${skillName}`);
}

async function installInboxSkill(
  skillName: string,
  scope: InstallScope,
  options: InstallOptions,
  logger: Logger,
): Promise<void> {
  const inboxDir = getInboxDir();
  const skillDir = path.join(inboxDir, skillName);

  logger.debug(`INBOX directory: ${inboxDir}`);
  logger.debug(`Skill directory: ${skillDir}`);

  if (!(await fs.pathExists(skillDir))) {
    throw new Error(`Skill not found in INBOX: ${skillName}`);
  }

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!(await fs.pathExists(skillMdPath))) {
    throw new Error(`SKILL.md not found in INBOX skill: ${skillName}`);
  }

  const targetDir = getTargetDir(skillName, scope);
  logger.debug(`Target directory: ${targetDir}`);

  await checkExistingSkill(skillName, targetDir, options.force, scope, logger);

  if (!options.skipScan) {
    console.log('Running security scan...');
    await runSecurityScan(skillName, skillDir, logger);
  } else {
    logger.debug('Skipping security scan (--skip-scan)');
  }

  const metadata = await readMetadata(skillDir);
  if (!metadata) {
    throw new Error(`Failed to read metadata for skill: ${skillName}`);
  }
  logger.debug(`Skill metadata: ${JSON.stringify(metadata)}`);

  let skillFolderHash = metadata.skillFolderHash;
  if (!skillFolderHash) {
    logger.debug(
      'skillFolderHash not found in metadata, fetching from GitHub...',
    );
    const token = getGitHubToken();
    const [owner, repo] = metadata.source.split('/');
    skillFolderHash = await fetchSkillFolderHash(
      `${owner}/${repo}`,
      metadata.skillPath,
      token,
    );
    if (!skillFolderHash) {
      logger.warn('Failed to fetch skillFolderHash, using empty string');
      skillFolderHash = '';
    }
  }
  logger.debug(`Skill folder hash: ${skillFolderHash}`);

  await copySkill(skillDir, targetDir, logger);
  console.log(`✓ Skill copied to: ${targetDir}`);

  const lockEntry: SkillLockEntry = {
    source: metadata.source.split('@')[0],
    sourceType: 'github',
    sourceUrl: metadata.sourceUrl,
    skillPath: metadata.skillPath,
    skillFolderHash,
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const lockManager = new LockManager(getConfig());
  await lockManager.addSkillToBothLocks(skillName, lockEntry);
  console.log('✓ Lock files updated');

  await fs.remove(skillDir);
  logger.debug(`✓ INBOX skill removed: ${skillDir}`);

  console.log(`✓ Installation complete: ${skillName}`);
}

function getTargetDir(skillName: string, scope: InstallScope): string {
  if (scope === 'global') {
    return path.join(os.homedir(), '.agents', 'skills', skillName);
  } else {
    return path.join(getConfig().getSkillsInstallDir(), skillName);
  }
}

async function checkExistingSkill(
  skillName: string,
  targetDir: string,
  force: boolean,
  scope: InstallScope,
  logger: Logger,
): Promise<void> {
  if (await fs.pathExists(targetDir)) {
    if (!force) {
      const scopeText = scope === 'global' ? 'global' : 'project';
      throw new Error(
        `Skill "${skillName}" already installed in ${scopeText} scope.\n` +
          `Use --force to overwrite or remove it first.`,
      );
    }
    logger.warn(`Removing existing skill: ${targetDir}`);
    await fs.remove(targetDir);
  }
}

async function copySkill(
  sourceDir: string,
  targetDir: string,
  logger: Logger,
): Promise<void> {
  await fs.ensureDir(path.dirname(targetDir));
  await fs.copy(sourceDir, targetDir, {
    filter: (src: string) => {
      const basename = path.basename(src);
      return !['.git', 'node_modules', 'metadata.json'].includes(basename);
    },
  });
}

async function runSecurityScan(
  skillName: string,
  skillDir: string,
  logger: Logger,
): Promise<void> {
  const result = await scanSkill(skillDir, skillName);

  if (result.status === 'fail') {
    throw new Error(
      `Security scan failed for skill "${skillName}" (risk score: ${result.riskScore}, critical: ${result.summary.critical}, warning: ${result.summary.warning})`,
    );
  }

  console.log(`✓ Security scan passed (risk score: ${result.riskScore})`);
}
