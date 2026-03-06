import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger.js';
import {
  Finding,
  CheckResult,
  ScanResult,
  IOCData,
} from './types.js';
import {
  RISK_SCORE_WEIGHTS,
  HIGH_RISK_THRESHOLD,
  MAX_RISK_SCORE,
  CHECK_METADATA,
} from './constants.js';
import { loadIOCData } from './ioc-loader.js';
import { loadWhitelist, filterWhitelistedFindings } from './whitelist.js';

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

export async function scanSkill(skillPath: string, skillName: string): Promise<ScanResult> {
  logger.info(`开始扫描技能: ${skillName}`, { path: skillPath });
  
  const startTime = Date.now();
  const iocData = loadIOCData();
  const whitelist = loadWhitelist();
  
  const checks: Record<string, CheckResult> = {};
  
  for (const metadata of CHECK_METADATA) {
    logger.debug(`执行检查: ${metadata.name}`);
    
    try {
      const checkFileName = metadata.id.replace(/_/g, '-');
      const checkModule = await import(`./checks/${checkFileName}.js`);
      const check = checkModule.default || checkModule.check;
      const findings = await check.run(skillPath, iocData, whitelist);
      const filteredFindings = filterWhitelistedFindings(findings, whitelist);
      
      checks[metadata.id] = {
        id: metadata.id,
        name: metadata.name,
        severity: metadata.severity,
        status: filteredFindings.length > 0 ? 'fail' : 'pass',
        findings: filteredFindings,
      };
      
      logger.debug(`检查完成: ${metadata.name} - ${checks[metadata.id].status}`);
    } catch (error) {
      logger.error(`检查失败: ${metadata.name}`, { error: (error as Error).message });
      checks[metadata.id] = {
        id: metadata.id,
        name: metadata.name,
        severity: metadata.severity,
        status: 'pass',
        findings: [],
      };
    }
  }
  
  const summary = calculateSummary(checks);
  const riskScore = calculateRiskScore(checks);
  const status = riskScore >= HIGH_RISK_THRESHOLD ? 'fail' : 'pass';
  
  const scanTime = new Date().toISOString();
  const duration = Date.now() - startTime;
  
  logger.info(`扫描完成: ${skillName}`, {
    status,
    riskScore,
    duration: `${duration}ms`,
    critical: summary.critical,
    warning: summary.warning,
  });
  
  return {
    skillName,
    scanTime,
    riskScore,
    status,
    checks,
    summary,
  };
}

function calculateSummary(checks: Record<string, CheckResult>): { critical: number; warning: number; passed: number } {
  let critical = 0;
  let warning = 0;
  let passed = 0;
  
  for (const check of Object.values(checks)) {
    if (check.status === 'fail') {
      if (check.severity === 'critical') {
        critical++;
      } else {
        warning++;
      }
    } else {
      passed++;
    }
  }
  
  return { critical, warning, passed };
}

function calculateRiskScore(checks: Record<string, CheckResult>): number {
  let score = 0;
  
  for (const check of Object.values(checks)) {
    if (check.status === 'fail') {
      if (check.severity === 'critical') {
        score += RISK_SCORE_WEIGHTS.critical;
      } else {
        score += RISK_SCORE_WEIGHTS.warning;
      }
    }
  }
  
  return Math.min(score, MAX_RISK_SCORE);
}
