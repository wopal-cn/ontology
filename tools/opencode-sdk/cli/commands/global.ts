import chalk from 'chalk';
import { Command } from 'commander';
import { getApi, getOptions } from '../api/client.js';
import { formatTable, formatSuccess, formatError, formatList } from '../output/format.js';

export const globalCommand = new Command('global')
  .description('全局命令');

// health - 健康检查
globalCommand
  .command('health')
  .description('检查服务器健康状态')
  .action(async () => {
    try {
      const api = getApi();
      const result = await api.globalHealth();
      const opts = getOptions();

      if (opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        formatSuccess('服务器运行正常');
        console.log(`  版本: ${result.data.version}`);
        console.log(`  状态: ${result.data.healthy ? '健康' : '异常'}`);
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });

// agents - 列出 Agents
globalCommand
  .command('agents')
  .description('列出所有可用的 AI Agents')
  .option('-d, --directory <path>', '项目目录')
  .action(async (options) => {
    try {
      const api = getApi();
      const result = await api.appAgents(options.directory);
      const opts = getOptions();

      if (opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        const agents = result.data as Array<{ name: string; description?: string; mode?: string }>;
        console.log(chalk.bold(`\n可用 Agents (${agents.length}):\n`));

        agents.forEach((agent) => {
          console.log(`  ${chalk.cyan(agent.name)} ${chalk.gray(`[${agent.mode || 'default'}]`)}`);
          if (agent.description) {
            console.log(`    ${chalk.gray(agent.description)}`);
          }
        });
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });

// skills - 列出 Skills
globalCommand
  .command('skills')
  .description('列出所有可用的 Skills')
  .option('-d, --directory <path>', '项目目录')
  .action(async (options) => {
    try {
      const api = getApi();
      const result = await api.appSkills(options.directory);
      const opts = getOptions();

      if (opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        const skills = result.data as Array<{ name: string; description?: string }>;
        console.log(chalk.bold(`\n可用 Skills (${skills.length}):\n`));

        skills.forEach((skill) => {
          console.log(`  ${chalk.cyan(skill.name)}`);
          if (skill.description) {
            console.log(`    ${chalk.gray(skill.description)}`);
          }
        });
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });

// commands - 列出命令
globalCommand
  .command('commands')
  .description('列出所有可用的命令')
  .option('-d, --directory <path>', '项目目录')
  .action(async (options) => {
    try {
      const api = getApi();
      const result = await api.commandList(options.directory);
      const opts = getOptions();

      if (opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        const commands = result.data as Array<{ name: string; description?: string }>;
        console.log(chalk.bold(`\n可用命令 (${commands.length}):\n`));

        commands.forEach((cmd) => {
          console.log(`  ${chalk.cyan(cmd.name)}`);
          if (cmd.description) {
            console.log(`    ${chalk.gray(cmd.description)}`);
          }
        });
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });