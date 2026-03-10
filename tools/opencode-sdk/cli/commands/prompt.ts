import chalk from 'chalk';
import ora from 'ora';
import { Command } from 'commander';
import { getApi, getOptions } from '../api/client.js';
import { formatError } from '../output/format.js';
import { parseModel } from '../src/utils/model.js';
import { streamResponse } from '../src/utils/streaming.js';

export const promptCommand = new Command('prompt')
  .description('向会话发送消息')
  .argument('<message>', '消息内容')
  .option('-s, --session <session-id>', '会话 ID')
  .option('-d, --directory <path>', '项目目录')
  .option('--model <model>', '模型名称 (格式: provider/model 或 model)')
  .option('--agent <agent>', 'Agent 名称')
  .option('--stream', '流式输出响应')
  .action(async (message, options) => {
    if (!options.session) {
      formatError('错误: 必须指定 --session 选项');
      console.log(chalk.gray('\n用法: oc-cli prompt <message> --session <session-id> [--stream]'));
      process.exit(1);
    }

    const sessionId = options.session;
    const spinner = ora('发送消息...').start();

    try {
      const api = getApi();

      if (options.stream) {
        // 流式模式
        spinner.stop();

        console.log(chalk.bold('\n发送消息...\n'));
        console.log(chalk.gray(`会话: ${sessionId}`));
        console.log(chalk.gray(`消息: ${message}\n`));
        console.log(chalk.bold('AI 响应:\n'));

        // 创建流式连接
        const eventSource = await streamResponse({
          sessionId,
          directory: options.directory,
        });

        // 连接建立后发送消息
        eventSource.onopen = async () => {
          try {
            await api.sessionPromptAsync(sessionId, options.directory, undefined, {
              parts: [{ type: 'text', text: message }],
              model: options.model ? parseModel(options.model) : undefined,
              agent: options.agent,
            });
          } catch (error: any) {
            console.error(chalk.red('\n发送失败:'), error.message);
            eventSource.close();
            process.exit(1);
          }
        };
      } else {
        // 同步模式
        const result = await api.sessionPrompt(sessionId, options.directory, undefined, {
          parts: [{ type: 'text', text: message }],
          model: options.model ? parseModel(options.model) : undefined,
          agent: options.agent,
        });
        spinner.stop();

        const opts = getOptions();
        if (opts.output === 'json') {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          // 提取并显示 AI 响应文本
          const parts = result.data.parts || [];
          const textParts = parts.filter((p: any) => p.type === 'text' && p.text);

          if (textParts.length > 0) {
            console.log(chalk.bold('\nAI 响应:\n'));
            textParts.forEach((p: any) => {
              console.log(p.text);
            });
          } else {
            console.log(chalk.gray('\n(响应不包含文本内容)'));
          }

          // 显示其他信息
          if (result.data.info) {
            const info = result.data.info as any;
            console.log(chalk.gray('\n---'));
            if (info.cost !== undefined) {
              console.log(chalk.gray(`成本: $${(info.cost / 1000000).toFixed(4)}`));
            }
            if (info.tokens) {
              console.log(chalk.gray(`Tokens: 输入 ${info.tokens.input || 0}, 输出 ${info.tokens.output || 0}`));
            }
          }
        }
      }
    } catch (error: any) {
      spinner.stop();
      formatError(error.message);
      process.exit(1);
    }
  });
