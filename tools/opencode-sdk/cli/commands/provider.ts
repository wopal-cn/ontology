import chalk from 'chalk';
import { Command } from 'commander';
import { getApi, getOptions } from '../api/client.js';
import { formatTable, formatSuccess, formatError } from '../output/format.js';

export const providerCommand = new Command('provider')
  .description('AI 提供商管理');

// list - 提供商列表
providerCommand
  .command('list')
  .description('列出所有 AI 提供商')
  .option('-d, --directory <path>', '项目目录')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const api = getApi();
      const result = await api.providerList(options.directory);

      const opts = getOptions();
      if (options.json || opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        const all = result.data.all || [];
        const connected = result.data.connected || [];

        console.log(chalk.bold(`\nAI 提供商 (${all.length}):\n`));
        console.log(chalk.green(`已连接: ${connected.length}`));
        connected.forEach((id: string) => {
          console.log(`  ${chalk.green('✓')} ${id}`);
        });

        console.log(chalk.gray(`\n可用: ${all.length - connected.length}`));
        const available = all.filter((p: any) => !connected.includes(p.id || p));
        available.slice(0, 20).forEach((p: any) => {
          const id = typeof p === 'string' ? p : p.id;
          console.log(`  ${chalk.gray('○')} ${id}`);
        });
        if (available.length > 20) {
          console.log(chalk.gray(`  ... 还有 ${available.length - 20} 个`));
        }
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });

// auth - 认证状态
providerCommand
  .command('auth')
  .description('查看提供商认证状态')
  .option('-d, --directory <path>', '项目目录')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const api = getApi();
      const result = await api.providerAuth(options.directory);

      const opts = getOptions();
      if (options.json || opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        console.log(chalk.bold('\n提供商认证状态:\n'));
        console.log(JSON.stringify(result.data, null, 2));
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });