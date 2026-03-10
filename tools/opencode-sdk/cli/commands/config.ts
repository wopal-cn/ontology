import chalk from 'chalk';
import { Command } from 'commander';
import { getApi, getOptions } from '../api/client.js';
import { formatSuccess, formatError } from '../output/format.js';

export const configCommand = new Command('config')
  .description('配置管理');

// get - 获取配置
configCommand
  .command('get [key]')
  .description('获取配置项')
  .option('-d, --directory <path>', '项目目录')
  .option('--global', '获取全局配置')
  .option('--json', 'JSON 格式输出')
  .action(async (key, options) => {
    try {
      const api = getApi();
      let result;

      if (options.global) {
        result = await api.globalConfigGet();
      } else {
        result = await api.configGet(options.directory);
      }

      const opts = getOptions();
      if (options.json || opts.output === 'json') {
        if (key) {
          console.log(JSON.stringify(result.data?.[key], null, 2));
        } else {
          console.log(JSON.stringify(result.data, null, 2));
        }
      } else {
        console.log(chalk.bold('\n配置:\n'));
        if (key) {
          console.log(`  ${key}: ${JSON.stringify(result.data?.[key])}`);
        } else {
          Object.entries(result.data || {}).forEach(([k, v]) => {
            console.log(`  ${k}: ${JSON.stringify(v)}`);
          });
        }
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });

// set - 设置配置
configCommand
  .command('set <key> <value>')
  .description('设置配置项')
  .option('-d, --directory <path>', '项目目录')
  .option('--global', '设置全局配置')
  .action(async (key, value, options) => {
    try {
      const api = getApi();

      // 尝试解析 JSON 值
      let parsedValue: unknown;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }

      if (options.global) {
        const currentConfig = (await api.globalConfigGet()).data || {};
        currentConfig[key] = parsedValue;
        await api.globalConfigUpdate(currentConfig);
      } else {
        const currentConfig = (await api.configGet(options.directory)).data || {};
        currentConfig[key] = parsedValue;
        await api.configUpdate(options.directory, undefined, currentConfig);
      }

      formatSuccess(`配置 ${key} 已更新`);
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });

// providers - 查看提供商配置
configCommand
  .command('providers')
  .description('查看提供商配置')
  .option('-d, --directory <path>', '项目目录')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const api = getApi();
      const result = await api.configProviders(options.directory);

      const opts = getOptions();
      if (options.json || opts.output === 'json') {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        console.log(chalk.bold('\n提供商配置:\n'));
        console.log(JSON.stringify(result.data, null, 2));
      }
    } catch (error: any) {
      formatError(error.message);
      process.exit(1);
    }
  });