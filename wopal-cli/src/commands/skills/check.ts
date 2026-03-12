import { Command } from 'commander';
import { Logger } from '../../lib/logger.js';
import { LockManager } from '../../lib/lock-manager.js';
import type { SkillLockEntry } from '../../types/lock.js';
import { fetchSkillFolderHash, getGitHubToken } from '../../lib/skill-lock.js';
import { computeSkillFolderHash } from '../../lib/hash.js';
import pLimit from 'p-limit';
import { buildHelpText } from '../../lib/help-texts.js';
import { getConfig } from '../../lib/config.js';

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

export interface CheckCommandOptions {
  local?: boolean;
  global?: boolean;
  json?: boolean;
}

export interface CheckResult {
  skillName: string;
  sourceType: 'github' | 'local';
  status:
    | 'up-to-date'
    | 'update-available'
    | 'source-changed'
    | 'source-missing'
    | 'error';
  installedHash: string;
  latestHash: string;
  error?: string;
}

export function registerCheckCommand(program: Command): void {
  const command = program
    .command('check [skill-name]')
    .description('Check installed skills for updates')
    .option('--local', 'Only check project-level skills')
    .option('--global', 'Only check global-level skills')
    .option('--json', 'Output JSON format report')
    .action(
      async (skillName: string | undefined, options: CheckCommandOptions) => {
        await checkCommand(skillName, options);
      },
    );

  command.addHelpText(
    'after',
    buildHelpText({
      examples: [
        '# Check all installed skills for updates\nwopal skills check',
        '# Check a specific skill\nwopal skills check my-skill',
        '# Check only project-level skills\nwopal skills check --local',
        '# Check only global skills\nwopal skills check --global',
        '# Output in JSON format\nwopal skills check --json',
      ],
      options: [
        '--local             Only check project-level skills',
        '--global            Only check global-level skills',
        '--json              Output in JSON format',
        '--help              Show this help message',
      ],
      notes: [
        'Compares installed skill hash with source hash',
        'GitHub skills: compares Tree SHA from API',
        'Local skills: compares folder content hash',
        'Requires GITHUB_TOKEN for higher API rate limits',
      ],
    }),
  );
}

export async function checkCommand(
  skillName: string | undefined,
  options: CheckCommandOptions,
): Promise<void> {
  try {
    const lockManager = new LockManager(getConfig());

    let skills: Record<string, SkillLockEntry>;

    if (options.local) {
      const projectLock = await lockManager.readProjectLock();
      skills = projectLock.skills;
    } else if (options.global) {
      const globalLock = await lockManager.readGlobalLock();
      const projectLock = await lockManager.readProjectLock();
      const projectSkillNames = new Set(Object.keys(projectLock.skills));
      skills = {};
      for (const [name, entry] of Object.entries(globalLock.skills)) {
        if (!projectSkillNames.has(name)) {
          skills[name] = entry;
        }
      }
    } else {
      const [projectLock, globalLock] = await Promise.all([
        lockManager.readProjectLock(),
        lockManager.readGlobalLock(),
      ]);
      skills = { ...globalLock.skills, ...projectLock.skills };
    }

    if (Object.keys(skills).length === 0) {
      console.log('No installed skills found.');
      return;
    }

    if (skillName) {
      if (!skills[skillName]) {
        logger.error(`Skill not found: ${skillName}`);
        return;
      }
      const singleSkill: Record<string, SkillLockEntry> = {
        [skillName]: skills[skillName],
      };
      const results = await checkSkills(singleSkill, options);
      displayResults(results, options);
    } else {
      const results = await checkSkills(skills, options);
      displayResults(results, options);
    }
  } catch (error) {
    logger.error('Check failed', { error: (error as Error).message });
    process.exit(1);
  }
}

async function checkSkills(
  skills: Record<string, SkillLockEntry>,
  options: CheckCommandOptions,
): Promise<CheckResult[]> {
  const skillNames = Object.keys(skills);
  const total = skillNames.length;

  if (!options.json) {
    console.log(`Checking ${total} skill${total > 1 ? 's' : ''}...`);
  }

  const limit = pLimit(5);
  const token = getGitHubToken() ?? undefined;

  const checkPromises = skillNames.map((skillName, index) =>
    limit(async () => {
      const entry = skills[skillName];
      const current = index + 1;

      if (!options.json) {
        const percentage = Math.round((current / total) * 100);
        const barLength = 20;
        const filled = Math.round((current / total) * barLength);
        const bar =
          '='.repeat(filled) +
          '>'.repeat(filled < barLength ? 1 : 0) +
          ' '.repeat(barLength - filled - (filled < barLength ? 1 : 0));

        const checkType =
          entry.sourceType === 'github'
            ? 'Fetching GitHub Tree SHA...'
            : 'Computing local hash...';

        console.log(
          `[${bar}] ${percentage}% [${current}/${total}] Checking ${skillName}... (${checkType})`,
        );
      }

      return await checkSkillWithRetry(skillName, entry, token);
    }),
  );

  const timeoutMs = 5 * 60 * 1000;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Check timeout (5 minutes)')), timeoutMs);
  });

  const results = await Promise.race([
    Promise.allSettled(checkPromises),
    timeoutPromise,
  ]);

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        skillName: skillNames[index],
        sourceType: skills[skillNames[index]].sourceType,
        status: 'error' as const,
        installedHash: skills[skillNames[index]].skillFolderHash,
        latestHash: '',
        error: result.reason?.message || 'Unknown error',
      };
    }
  });
}

async function checkSkillWithRetry(
  skillName: string,
  entry: SkillLockEntry,
  token: string | undefined,
  maxRetries: number = 3,
): Promise<CheckResult> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await checkSkill(skillName, entry, token);
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return {
    skillName,
    sourceType: entry.sourceType,
    status: 'error',
    installedHash: entry.skillFolderHash,
    latestHash: '',
    error: lastError?.message || 'Max retries exceeded',
  };
}

async function checkSkill(
  skillName: string,
  entry: SkillLockEntry,
  token: string | undefined,
): Promise<CheckResult> {
  try {
    let latestHash: string;

    if (entry.sourceType === 'github') {
      const hash = await fetchSkillFolderHash(
        entry.source,
        entry.skillPath,
        token,
      );
      if (!hash) {
        throw new Error('Failed to fetch GitHub Tree SHA');
      }
      latestHash = hash;
    } else {
      latestHash = await computeSkillFolderHash(entry.sourceUrl);
    }

    let status: CheckResult['status'];
    if (latestHash === entry.skillFolderHash) {
      status = 'up-to-date';
    } else {
      status =
        entry.sourceType === 'github' ? 'update-available' : 'source-changed';
    }

    return {
      skillName,
      sourceType: entry.sourceType,
      status,
      installedHash: entry.skillFolderHash,
      latestHash,
    };
  } catch (error) {
    return {
      skillName,
      sourceType: entry.sourceType,
      status: 'error',
      installedHash: entry.skillFolderHash,
      latestHash: '',
      error: (error as Error).message,
    };
  }
}

function displayResults(
  results: CheckResult[],
  options: CheckCommandOptions,
): void {
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const upToDate = results.filter((r) => r.status === 'up-to-date');
  const updateAvailable = results.filter(
    (r) => r.status === 'update-available',
  );
  const sourceChanged = results.filter((r) => r.status === 'source-changed');
  const sourceMissing = results.filter((r) => r.status === 'source-missing');
  const errors = results.filter((r) => r.status === 'error');

  console.log('\n=== Check Results ===\n');

  if (updateAvailable.length > 0) {
    console.log('\x1b[33m⚠ Update Available:\x1b[0m');
    updateAvailable
      .sort((a, b) => a.skillName.localeCompare(b.skillName))
      .forEach((r) => {
        console.log(`  ${r.skillName} (${r.sourceType})`);
        console.log(`    Installed: ${r.installedHash.substring(0, 8)}`);
        console.log(`    Latest:    ${r.latestHash.substring(0, 8)}`);
      });
    console.log();
  }

  if (sourceChanged.length > 0) {
    console.log('\x1b[33m⚠ Source Changed:\x1b[0m');
    sourceChanged
      .sort((a, b) => a.skillName.localeCompare(b.skillName))
      .forEach((r) => {
        console.log(`  ${r.skillName} (${r.sourceType})`);
        console.log(`    Installed: ${r.installedHash.substring(0, 8)}`);
        console.log(`    Current:   ${r.latestHash.substring(0, 8)}`);
      });
    console.log();
  }

  if (sourceMissing.length > 0) {
    console.log('\x1b[31m✗ Source Missing:\x1b[0m');
    sourceMissing
      .sort((a, b) => a.skillName.localeCompare(b.skillName))
      .forEach((r) => {
        console.log(`  ${r.skillName} (${r.sourceType})`);
      });
    console.log();
  }

  if (errors.length > 0) {
    console.log('\x1b[31m✗ Errors:\x1b[0m');
    errors
      .sort((a, b) => a.skillName.localeCompare(b.skillName))
      .forEach((r) => {
        console.log(`  ${r.skillName}: ${r.error}`);
      });
    console.log();
  }

  if (upToDate.length > 0) {
    console.log('\x1b[32m✓ Up to Date:\x1b[0m');
    upToDate
      .sort((a, b) => a.skillName.localeCompare(b.skillName))
      .forEach((r) => {
        console.log(`  ${r.skillName} (${r.sourceType})`);
      });
    console.log();
  }

  console.log('=== Summary ===');
  console.log(`Total:        ${results.length}`);
  console.log(`Up to Date:   ${upToDate.length}`);
  console.log(`Updates:      ${updateAvailable.length}`);
  console.log(`Changed:      ${sourceChanged.length}`);
  console.log(`Missing:      ${sourceMissing.length}`);
  console.log(`Errors:       ${errors.length}`);

  if (updateAvailable.length > 0 || sourceChanged.length > 0) {
    const updateList = updateAvailable.map((r) => r.skillName);
    const changedList = sourceChanged.map((r) => r.skillName);
    const allUpdates = [...updateList, ...changedList];

    console.log('\nTo update: wopal skills update ' + allUpdates.join(' '));
  }
}
