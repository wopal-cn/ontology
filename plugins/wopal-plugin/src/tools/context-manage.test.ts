import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearPendingConfirmation,
  getPendingConfirmation,
  setPendingConfirmation,
} from '../memory/distill.js';
import { createContextManageTool } from './context-manage.js';

function getExecute(toolDefinition: unknown) {
  return (toolDefinition as { execute: (...args: unknown[]) => Promise<string> }).execute;
}

function makeUserMsg(parts: Array<{ type: string; text?: string; synthetic?: boolean }>) {
  return { info: { role: 'user' }, parts };
}

function makeAssistantMsg(parts: Array<{ type: string; text?: string }>) {
  return { info: { role: 'assistant' }, parts };
}

const mockComplete = vi.fn();
const mockMessages = vi.fn();
const mockUpdate = vi.fn();

const distillLLM = { complete: mockComplete };
const summaryClient = {
  session: { messages: mockMessages, update: mockUpdate },
};

const summaryCtx = { sessionID: 'ses-summary-test' } as { sessionID: string };

describe('context_manage: handleSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete.mockResolvedValue('测试会话摘要');
    mockUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters out synthetic parts from user messages', async () => {
    const messages = [
      makeUserMsg([
        { type: 'text', text: '真实用户消息' },
        { type: 'text', text: '[WOPAL TASK COMPLETED] 任务完成', synthetic: true },
      ]),
    ];
    mockMessages.mockResolvedValue({ data: messages });

    const tool = createContextManageTool(distillLLM, summaryClient);
    const execute = getExecute(tool);
    const result = await execute({ action: 'summary' }, summaryCtx);

    expect(result).not.toContain('WOPAL TASK COMPLETED');
    expect(mockComplete).toHaveBeenCalledOnce();
    const promptArg = mockComplete.mock.calls[0][0] as string;
    expect(promptArg).toContain('真实用户消息');
    expect(promptArg).not.toContain('WOPAL TASK');
  });

  it('skips compaction messages entirely', async () => {
    const messages = [
      makeUserMsg([{ type: 'compaction' }, { type: 'text', text: '压缩消息内容' }]),
      makeUserMsg([{ type: 'text', text: '最新用户消息' }]),
    ];
    mockMessages.mockResolvedValue({ data: messages });

    const tool = createContextManageTool(distillLLM, summaryClient);
    const execute = getExecute(tool);
    await execute({ action: 'summary' }, summaryCtx);

    const promptArg = mockComplete.mock.calls[0][0] as string;
    expect(promptArg).not.toContain('压缩消息内容');
    expect(promptArg).toContain('最新用户消息');
  });

  it('truncates from tail keeping latest messages', async () => {
    // 3 messages with unique markers to verify truncation behavior
    const oldText = 'X'.repeat(5000); // Will be truncated
    const newText = 'Y'.repeat(1000); // Will be kept
    const messages = [
      makeUserMsg([{ type: 'text', text: oldText }]),
      makeUserMsg([{ type: 'text', text: newText }]),
    ];
    mockMessages.mockResolvedValue({ data: messages });

    const tool = createContextManageTool(distillLLM, summaryClient);
    const execute = getExecute(tool);
    await execute({ action: 'summary' }, summaryCtx);

    const promptArg = mockComplete.mock.calls[0][0] as string;
    // Combined: 5000 + 10 (sep) + 1000 = 6010; slice(-3000) → last 3000 chars
    // That's ~1990 X's + separator + 1000 Y's. Y should definitely be present.
    expect(promptArg).toContain('YYY');
    // X content is present due to overlap (5000 > 3000 - 1000 - 10)
    // Instead verify truncation happened at all: combined is 6010 but prompt user text < 3100
    const userMsgSection = promptArg.split('用户消息：\n')[1]?.split('\n\n要求：')[0] ?? '';
    expect(userMsgSection.length).toBeLessThanOrEqual(3000);
  });

  it('returns message for empty sessions', async () => {
    mockMessages.mockResolvedValue({ data: [] });

    const tool = createContextManageTool(distillLLM, summaryClient);
    const execute = getExecute(tool);
    const result = await execute({ action: 'summary' }, summaryCtx);

    expect(result).toContain('No messages');
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('returns message when no user messages exist', async () => {
    const messages = [
      makeAssistantMsg([{ type: 'text', text: '助手回复' }]),
    ];
    mockMessages.mockResolvedValue({ data: messages });

    const tool = createContextManageTool(distillLLM, summaryClient);
    const execute = getExecute(tool);
    const result = await execute({ action: 'summary' }, summaryCtx);

    expect(result).toContain('No user messages');
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('includes clear positioning in tool description', () => {
    const tool = createContextManageTool(distillLLM, summaryClient);
    const desc = (tool as unknown as { description: string }).description;
    expect(desc).toContain('内部基础设施');
    expect(desc).toContain('不是会话回顾工具');
    expect(desc).toContain('禁止主动生成长格式会话摘要');
  });
});