import chalk from 'chalk';
import ora from 'ora';
import { Command } from 'commander';
import { getApi, getOptions } from '../api/client.js';
import { formatTable, formatSuccess, formatError } from '../output/format.js';

export const sessionCommand = new Command('session')
  .description('会话管理');

// list - 列出会话
sessionCommand
  .command('list')
  .description('列出所有会话')
  .option('-d, --directory <path>', '项目目录')
  .option('--search <text>', '搜索关键词')
  .option('--limit <n>', '限制数量', '20')
  .option('--roots', '只显示根会话')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    const spinner = ora('加载会话列表...').start();
    try {
      const api = getApi();
      const result = await api.sessionList(
        options.directory,
        undefined,
        options.roots,
        undefined,
        options.search,
        parseInt(options.limit)
      );
      spinner.stop();

      const opts = getOptions();
      if (options.json || opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        const sessions = (result.data || []) as Array<{
          id: string;
          title?: string;
          time?: string;
          messageCount?: number;
        }>;

        console.log(chalk.bold(`\n会话列表 (${sessions.length}):\n`));
        formatTable(sessions, ['id', 'title', 'messageCount'], ['ID', '标题', '消息数']);
      }
    } catch (error: any) {
      spinner.stop();
      formatError(error.message);
      process.exit(1);
    }
  });

// create - 创建会话
sessionCommand
  .command('create')
  .description('创建新会话')
  .option('-d, --directory <path>', '项目目录')
  .option('--title <title>', '会话标题')
  .option('--parent <id>', '父会话 ID')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    const spinner = ora('创建会话...').start();
    try {
      const api = getApi();
      const result = await api.sessionCreate(
        options.directory,
        undefined,
        {
          title: options.title,
          parentID: options.parent,
        }
      );
      spinner.stop();

      const opts = getOptions();
      if (options.json || opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        formatSuccess('会话创建成功');
        console.log(`  ID: ${result.data.id}`);
        if (result.data.title) {
          console.log(`  标题: ${result.data.title}`);
        }
      }
    } catch (error: any) {
      spinner.stop();
      formatError(error.message);
      process.exit(1);
    }
  });

// get - 查看会话详情
sessionCommand
  .command('get <session-id>')
  .description('查看会话详情')
  .option('-d, --directory <path>', '项目目录')
  .option('--json', 'JSON 格式输出')
  .action(async (sessionId, options) => {
    try {
      const api = getApi();
      const result = await api.sessionMessages(
        sessionId,
        options.directory
      );

      const opts = getOptions();
      if (options.json || opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        console.log(chalk.bold(`\n会话: ${sessionId}\n`));
        const messages = (result.data || []) as Array<{
          id: string;
          role?: string;
          time?: string;
        }>;
        formatTable(messages, ['id', 'role', 'time'], ['消息ID', '角色', '时间']);
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });

// delete - 删除会话
sessionCommand
  .command('delete <session-id>')
  .description('删除会话')
  .option('-d, --directory <path>', '项目目录')
  .action(async (sessionId, options) => {
    const spinner = ora('删除会话...').start();
    try {
      const api = getApi();
      await api.sessionDelete(sessionId, options.directory);
      spinner.stop();
      formatSuccess(`会话 ${sessionId} 已删除`);
    } catch (error: any) {
      spinner.stop();
      formatError(error.message);
      process.exit(1);
    }
  });

// abort - 中止会话
sessionCommand
  .command('abort <session-id>')
  .description('中止正在进行的会话')
  .option('-d, --directory <path>', '项目目录')
  .action(async (sessionId, options) => {
    const spinner = ora('中止会话...').start();
    try {
      const api = getApi();
      await api.sessionAbort(sessionId, options.directory);
      spinner.stop();
      formatSuccess(`会话 ${sessionId} 已中止`);
    } catch (error: any) {
      spinner.stop();
      formatError(error.message);
      process.exit(1);
    }
  });

// messages - 查看消息列表
sessionCommand
  .command('messages <session-id>')
  .description('查看会话消息列表')
  .option('-d, --directory <path>', '项目目录')
  .option('--limit <n>', '限制数量', '50')
  .option('--json', 'JSON 格式输出')
  .action(async (sessionId, options) => {
    try {
      const api = getApi();
      const result = await api.sessionMessages(
        sessionId,
        options.directory,
        parseInt(options.limit)
      );

      const opts = getOptions();
      if (options.json || opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        const messages = (result.data || []) as Array<{
          id: string;
          role?: string;
          time?: string;
        }>;
        console.log(chalk.bold(`\n会话消息 (${messages.length}):\n`));
        formatTable(messages, ['id', 'role', 'time'], ['消息ID', '角色', '时间']);
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });