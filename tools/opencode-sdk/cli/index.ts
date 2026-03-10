#!/usr/bin/env node

import { Command } from 'commander';
import { setOptions } from './api/client.js';
import { globalCommand } from './commands/global.js';
import { sessionCommand } from './commands/session.js';
import { projectCommand } from './commands/project.js';
import { providerCommand } from './commands/provider.js';
import { configCommand } from './commands/config.js';
import { fileCommand, findCommand } from './commands/file.js';
import { promptCommand } from './commands/prompt.js';

const program = new Command();

program
  .name('oc-cli')
  .description('OpenCode CLI - 与 OpenCode 服务器交互')
  .version('1.0.0');

// 全局选项
program
  .option('--server <url>', '服务器地址', 'http://127.0.0.1:3456')
  .option('--output <format>', '输出格式: table | json', 'table')
  .option('--debug', '调试模式');

// 注册命令
program.addCommand(globalCommand);
program.addCommand(sessionCommand);
program.addCommand(projectCommand);
program.addCommand(providerCommand);
program.addCommand(configCommand);
program.addCommand(fileCommand);
program.addCommand(findCommand);
program.addCommand(promptCommand);

// 快捷命令 - health
program
  .command('health')
  .description('检查服务器健康状态')
  .action(async () => {
    const { getApi, getOptions } = await import('./api/client.js');
    const { formatSuccess, formatError } = await import('./output/format.js');

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

// 解析命令行参数并设置全局选项
program.parse();
const options = program.opts();
setOptions({
  server: options.server,
  output: options.output,
  debug: options.debug,
});