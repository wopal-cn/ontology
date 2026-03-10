import chalk from 'chalk';
import { Command } from 'commander';
import { getApi, getOptions } from '../api/client.js';
import { formatTable, formatSuccess, formatError } from '../output/format.js';

export const projectCommand = new Command('project')
  .description('项目管理');

// current - 当前项目
projectCommand
  .command('current')
  .description('显示当前项目')
  .option('-d, --directory <path>', '项目目录')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const api = getApi();
      const result = await api.projectCurrent(options.directory);

      const opts = getOptions();
      if (options.json || opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        console.log(chalk.bold('\n当前项目:\n'));
        console.log(`  ID:   ${result.data.id}`);
        console.log(`  名称: ${result.data.name || '未命名'}`);
        console.log(`  路径: ${result.data.worktree || '-'}`);
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });

// list - 项目列表
projectCommand
  .command('list')
  .description('列出所有项目')
  .option('-d, --directory <path>', '项目目录')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const api = getApi();
      const result = await api.projectList(options.directory);

      const opts = getOptions();
      if (options.json || opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        const projects = (result.data || []) as Array<{
          id: string;
          name?: string;
          path?: string;
        }>;
        console.log(chalk.bold(`\n项目列表 (${projects.length}):\n`));
        formatTable(projects, ['id', 'name', 'path'], ['ID', '名称', '路径']);
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });