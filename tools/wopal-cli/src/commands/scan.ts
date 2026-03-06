import * as path from 'path';
import * as fs from 'fs';
import { Command } from 'commander';
import { Logger } from '../utils/logger.js';
import { scanSkill } from '../scanner/scanner.js';
import { ScanResult } from '../scanner/types.js';
import { getInboxDir } from '../utils/inbox-utils.js';

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

export interface ScanCommandOptions {
  json?: boolean;
  all?: boolean;
  output?: string;
}

export function registerScanCommand(program: Command): void {
  program
    .command('scan [skill-name]')
    .description('Scan INBOX skill for security issues')
    .option('--json', 'Output JSON format')
    .option('--all', 'Scan all INBOX skills')
    .option('--output <file>', 'Save JSON report to file')
    .action(async (skillName: string | undefined, options: ScanCommandOptions) => {
      const exitCode = await scanCommand(skillName, options);
      process.exit(exitCode);
    });
}

export async function scanCommand(skillName: string | undefined, options: ScanCommandOptions): Promise<number> {
  try {
    if (options.all) {
      return await scanAllSkills(options);
    } else if (skillName) {
      return await scanSingleSkill(skillName, options);
    } else {
      logger.error('请指定技能名称或使用 --all 参数');
      console.log('用法: wopal skills scan <skill-name>');
      console.log('      wopal skills scan --all');
      return 2;
    }
  } catch (error) {
    logger.error('扫描失败', { error: (error as Error).message });
    return 2;
  }
}

async function scanSingleSkill(skillName: string, options: ScanCommandOptions): Promise<number> {
  const inboxPath = getInboxDir();
  const skillPath = path.join(inboxPath, skillName);
  
  if (!fs.existsSync(skillPath)) {
    logger.error(`技能不存在: ${skillName}`);
    return 2;
  }
  
  logger.info(`扫描技能: ${skillName}`);
  
  const result = await scanSkill(skillPath, skillName);
  
  if (options.json) {
    const jsonOutput = JSON.stringify(result, null, 2);
    
    if (options.output) {
      fs.writeFileSync(options.output, jsonOutput, 'utf-8');
      console.log(`扫描报告已保存到 ${options.output}`);
    } else {
      console.log(jsonOutput);
    }
  } else {
    displayScanResult(result);
  }
  
  return result.status === 'pass' ? 0 : 1;
}

async function scanAllSkills(options: ScanCommandOptions): Promise<number> {
  const inboxPath = getInboxDir();
  
  if (!fs.existsSync(inboxPath)) {
    logger.error('INBOX 目录不存在');
    return 2;
  }
  
  const skillDirs = fs.readdirSync(inboxPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  
  if (skillDirs.length === 0) {
    logger.info('INBOX 中没有技能');
    return 0;
  }
  
  logger.info(`扫描所有 INBOX 技能: ${skillDirs.length} 个`);
  
  const results: ScanResult[] = [];
  let passCount = 0;
  let failCount = 0;
  
  for (const skillName of skillDirs) {
    const skillPath = path.join(inboxPath, skillName);
    const result = await scanSkill(skillPath, skillName);
    results.push(result);
    
    if (result.status === 'pass') {
      passCount++;
    } else {
      failCount++;
    }
    
    console.log(`✓ ${skillName}: ${result.status.toUpperCase()} (风险评分: ${result.riskScore})`);
  }
  
  console.log('\n扫描摘要:');
  console.log(`  总计: ${skillDirs.length}`);
  console.log(`  通过: ${passCount}`);
  console.log(`  失败: ${failCount}`);
  
  if (options.json) {
    const jsonOutput = JSON.stringify(results, null, 2);
    
    if (options.output) {
      fs.writeFileSync(options.output, jsonOutput, 'utf-8');
      console.log(`\n扫描报告已保存到 ${options.output}`);
    } else {
      console.log('\n' + jsonOutput);
    }
  }
  
  return failCount > 0 ? 1 : 0;
}

function displayScanResult(result: ScanResult): void {
  console.log(`\n扫描结果: ${result.skillName}`);
  console.log(`状态: ${result.status.toUpperCase()}`);
  console.log(`风险评分: ${result.riskScore}`);
  console.log(`扫描时间: ${result.scanTime}`);
  console.log('\n检查摘要:');
  console.log(`  严重: ${result.summary.critical}`);
  console.log(`  警告: ${result.summary.warning}`);
  console.log(`  通过: ${result.summary.passed}`);
  
  const failedChecks = Object.values(result.checks).filter(check => check.status === 'fail');
  
  if (failedChecks.length > 0) {
    console.log('\n失败的检查:');
    
    for (const check of failedChecks) {
      console.log(`\n  [${check.severity.toUpperCase()}] ${check.name}`);
      
      for (const finding of check.findings) {
        console.log(`    - 文件: ${finding.file}`);
        if (finding.line) {
          console.log(`      行号: ${finding.line}`);
        }
        console.log(`      模式: ${finding.pattern}`);
        console.log(`      消息: ${finding.message}`);
      }
    }
  }
  
  if (result.status === 'fail') {
    console.log('\n⚠️  高风险技能，建议不要安装');
  } else {
    console.log('\n✓ 扫描通过');
  }
}
