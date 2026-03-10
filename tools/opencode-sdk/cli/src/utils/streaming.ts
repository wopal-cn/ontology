import chalk from 'chalk';
// @ts-ignore
import { EventSource } from 'eventsource';
import { getOptions } from '../../api/client.js';

/**
 * 流式响应选项
 */
export interface StreamOptions {
  /** 会话 ID */
  sessionId: string;
  /** 项目目录 */
  directory?: string;
  /** 是否显示完成提示 */
  showCompletionHint?: boolean;
  /** 自定义事件处理回调 */
  onDelta?: (delta: string) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

/**
 * 创建流式响应连接并处理事件
 *
 * @param options - 流式响应配置选项
 * @returns EventSource 实例，允许手动关闭连接
 *
 * @example
 * const eventSource = await streamResponse({
 *   sessionId: 'abc123',
 *   directory: '/path/to/project',
 *   onDelta: (text) => process.stdout.write(text),
 *   onComplete: () => console.log('\n完成!')
 * });
 */
export async function streamResponse(options: StreamOptions): Promise<EventSource> {
  const opts = getOptions();
  const {
    sessionId,
    directory,
    showCompletionHint = true,
    onDelta,
    onComplete,
    onError,
  } = options;

  const eventUrl = `${opts.server}/event${
    directory ? `?directory=${encodeURIComponent(directory)}` : ''
  }`;

  let isComplete = false;

  // 创建 EventSource 连接
  const eventSource = new EventSource(eventUrl);

  // 监听消息事件
  eventSource.onmessage = (event: any) => {
    try {
      const data = JSON.parse(event.data);

      // 只处理当前会话的事件
      if (data.properties?.sessionID !== sessionId) return;

      switch (data.type) {
        case 'message.part.delta':
          // 流式文本增量
          if (data.properties?.delta) {
            if (onDelta) {
              onDelta(data.properties.delta);
            } else {
              process.stdout.write(data.properties.delta);
            }
          }
          break;

        case 'session.idle':
          // 会话空闲，响应完成
          isComplete = true;
          eventSource.close();

          if (showCompletionHint) {
            console.log(chalk.gray('\n\n--- 响应完成 ---'));
          }

          if (onComplete) {
            onComplete();
          }
          break;

        case 'session.error':
          const errorMessage = data.properties?.error || '未知错误';
          if (onError) {
            onError(errorMessage);
          } else {
            console.error(chalk.red('\n错误:'), errorMessage);
          }
          eventSource.close();
          break;
      }
    } catch (e) {
      // 忽略解析错误
    }
  };

  eventSource.onerror = () => {
    if (!isComplete) {
      const errorMsg = '\n连接错误';
      if (onError) {
        onError(errorMsg);
      } else {
        console.error(chalk.red(errorMsg));
      }
    }
    eventSource.close();
  };

  return eventSource;
}
