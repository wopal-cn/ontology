import chalk from 'chalk';
import { Command } from 'commander';
import { getApi, getOptions } from '../api/client.js';
import { formatTable, formatError } from '../output/format.js';

export const fileCommand = new Command('file')
  .description('文件操作');

// list - 列出文件
fileCommand
  .command('list <path>')
  .description('列出目录内容')
  .option('-d, --directory <project>', '项目目录')
  .option('--json', 'JSON 格式输出')
  .action(async (path, options) => {
    try {
      const api = getApi();
      const result = await api.fileList(path, options.directory);

      const opts = getOptions();
      if (options.json || opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        const files = (result.data || []) as Array<{
          name?: string;
          isDir?: boolean;
          size?: number;
        }>;
        console.log(chalk.bold(`\n目录: ${path} (${files.length}):\n`));
        files.forEach((f) => {
          const icon = f.isDir ? chalk.blue('📁') : chalk.gray('📄');
          console.log(`  ${icon} ${f.name}`);
        });
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });

// read - 读取文件
fileCommand
  .command('read <path>')
  .description('读取文件内容')
  .option('-d, --directory <project>', '项目目录')
  .action(async (path, options) => {
    try {
      const api = getApi();
      const result = await api.fileRead(path, options.directory);
      console.log(result.data);
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });

// status - 文件状态
fileCommand
  .command('status')
  .description('查看 Git 文件状态')
  .option('-d, --directory <path>', '项目目录')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const api = getApi();
      const result = await api.fileStatus(options.directory);

      const opts = getOptions();
      if (options.json || opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        console.log(chalk.bold('\n文件状态:\n'));
        console.log(JSON.stringify(result.data, null, 2));
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });

// find 命令
export const findCommand = new Command('find')
  .description('查找功能');

findCommand
  .command('files <pattern>')
  .description('按名称查找文件')
  .option('-d, --directory <path>', '项目目录')
  .option('--type <type>', '类型: file 或 dir')
  .option('--limit <n>', '限制数量', '50')
  .option('--json', 'JSON 格式输出')
  .action(async (pattern, options) => {
    try {
      const api = getApi();
      const result = await api.findFiles(
        pattern,
        options.directory,
        options.type,
        parseInt(options.limit)
      );

      const opts = getOptions();
      if (options.json || opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        const files = result.data || [];
        console.log(chalk.bold(`\n匹配文件 (${files.length}):\n`));
        files.forEach((f: any) => {
          console.log(`  ${f.path}`);
        });
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });

findCommand
  .command('text <pattern>')
  .description('在文件中搜索文本')
  .option('-d, --directory <path>', '项目目录')
  .option('--json', 'JSON 格式输出')
  .action(async (pattern, options) => {
    try {
      const api = getApi();
      const result = await api.findText(pattern, options.directory);

      const opts = getOptions();
      if (options.json || opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        const results = result.data || [];
        console.log(chalk.bold(`\n搜索结果:\n`));
        results.forEach((r: any) => {
          console.log(`${chalk.cyan(r.path)}:${r.line}`);
          console.log(`  ${r.content}`);
        });
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });

findCommand
  .command('symbols <query>')
  .description('查找符号 (函数、类、变量)')
  .option('-d, --directory <path>', '项目目录')
  .option('--json', 'JSON 格式输出')
  .action(async (query, options) => {
    try {
      const api = getApi();
      const result = await api.findSymbols(query, options.directory);

      const opts = getOptions();
      if (options.json || opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        const symbols = result.data || [];
        console.log(chalk.bold(`\n符号 (${symbols.length}):\n`));
        symbols.forEach((s: any) => {
          console.log(`  ${chalk.cyan(s.name)} ${chalk.gray(`[${s.kind}]`)} ${s.path}`);
        });
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });