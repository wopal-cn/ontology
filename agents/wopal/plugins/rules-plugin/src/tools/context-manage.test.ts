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

describe('context_manage', () => {
  afterEach(() => {
    clearPendingConfirmation('ses-test');
    vi.restoreAllMocks();
  });

  it('prevents duplicate concurrent confirm for same session', async () => {
    let resolveConfirm: ((value: { created: number; merged: number; skipped: number; mergeDetails: Array<{ existingId: string; existingPreview: string; mergedPreview: string }> }) => void) | undefined;
    const confirmCandidates = vi.fn().mockImplementation(
      () => new Promise((resolve) => {
        resolveConfirm = resolve;
      }),
    );

    setPendingConfirmation('ses-test', {
      title: 'test title',
      candidates: [
        {
          category: 'knowledge',
          body: '## [技术知识]: 测试\n这是一个用于验证 confirm 重入保护的候选记忆正文，长度足够。',
          concepts: ['test'],
          importance: 0.7,
        },
      ],
    });

    const tool = createContextManageTool(
      {} as never,
      {} as never,
      { confirmCandidates } as never,
      undefined,
    );
    const execute = getExecute(tool);

    const first = execute({ action: 'confirm' }, { sessionID: 'ses-test' });
    await Promise.resolve();

    const second = await execute({ action: 'confirm' }, { sessionID: 'ses-test' });

    expect(second).toBe('⚠️ Distillation confirm is already running for this session. Wait for it to finish.');
    expect(getPendingConfirmation('ses-test')).toBeUndefined();

    resolveConfirm?.({ created: 1, merged: 0, skipped: 0, mergeDetails: [] });
    const firstResult = await first;

    expect(firstResult).toContain('Distillation Complete');
    expect(confirmCandidates).toHaveBeenCalledTimes(1);
    expect(getPendingConfirmation('ses-test')).toBeUndefined();
  });
});
