import { describe, expect, it, vi } from 'vitest';

import { OpenCodeRulesRuntime } from './runtime.js';
import { SessionStore } from './session-store.js';

function createRuntime(opts?: {
  formatForSystem?: ReturnType<typeof vi.fn>;
  isEmpty?: ReturnType<typeof vi.fn>;
  isChildSession?: ReturnType<typeof vi.fn>;
}) {
  const sessionStore = new SessionStore({ max: 10 });
  const runtime = new OpenCodeRulesRuntime({
    client: {
      session: {
        messages: vi.fn().mockResolvedValue({ data: [] }),
      },
      tool: { ids: vi.fn().mockResolvedValue({ data: [] }) },
      mcp: { status: vi.fn().mockResolvedValue({ data: {} }) },
    } as any,
    directory: '/tmp',
    projectDirectory: '/tmp',
    ruleFiles: [],
    sessionStore,
    debugLog: () => {},
    memoryInjector: {
      isEmpty: opts?.isEmpty ?? vi.fn().mockResolvedValue(false),
      formatForSystem:
        opts?.formatForSystem ??
        vi.fn().mockResolvedValue('<system-reminder>\n# 相关记忆\n\n## 知识\n\n- test memory\n\n</system-reminder>'),
    } as any,
  });

  if (opts?.isChildSession) {
    (runtime as any).isChildSession = opts.isChildSession;
  } else {
    (runtime as any).isChildSession = vi.fn().mockResolvedValue(false);
  }

  return { runtime, sessionStore };
}

describe('OpenCodeRulesRuntime memory injection state', () => {
  it('stores injectedRawText after successful injection', async () => {
    const { runtime, sessionStore } = createRuntime();

    sessionStore.upsert('ses_1', (state) => {
      state.lastUserPrompt = 'show me memory';
      state.needsMemoryInjection = true;
    });

    const result = await (runtime as any).onSystemTransform(
      { sessionID: 'ses_1', model: { providerID: 'test', modelID: 'test' } },
      { system: ['Base prompt.'] },
    );

    expect(result.system.join('\n')).toContain('# 相关记忆');
    expect(sessionStore.get('ses_1')?.injectedRawText).toContain('# 相关记忆');
  });

  it('clears injectedRawText when current turn skips memory injection', async () => {
    const { runtime, sessionStore } = createRuntime();

    sessionStore.upsert('ses_2', (state) => {
      state.lastUserPrompt = '/memory list';
      state.needsMemoryInjection = true;
      state.injectedRawText = '<system-reminder>old memory</system-reminder>';
    });

    const result = await (runtime as any).onSystemTransform(
      { sessionID: 'ses_2', model: { providerID: 'test', modelID: 'test' } },
      { system: ['Base prompt.'] },
    );

    expect(result.system).toEqual(['Base prompt.']);
    expect(sessionStore.get('ses_2')?.injectedRawText).toBeUndefined();
  });

  it('clears injectedRawText when no relevant memories are found', async () => {
    const { runtime, sessionStore } = createRuntime({
      formatForSystem: vi.fn().mockResolvedValue(undefined),
    });

    sessionStore.upsert('ses_3', (state) => {
      state.lastUserPrompt = 'unrelated query';
      state.needsMemoryInjection = true;
      state.injectedRawText = '<system-reminder>old memory</system-reminder>';
    });

    const result = await (runtime as any).onSystemTransform(
      { sessionID: 'ses_3', model: { providerID: 'test', modelID: 'test' } },
      { system: ['Base prompt.'] },
    );

    expect(result.system).toEqual(['Base prompt.']);
    expect(sessionStore.get('ses_3')?.injectedRawText).toBeUndefined();
  });

  it('skips memory injection for child sessions (task tool)', async () => {
    const formatForSystem = vi.fn().mockResolvedValue('<memory>');
    const { runtime, sessionStore } = createRuntime({
      formatForSystem,
      isChildSession: vi.fn().mockResolvedValue(true),
    });

    sessionStore.upsert('ses_child', (state) => {
      state.lastUserPrompt = 'do something';
      state.needsMemoryInjection = true;
    });

    const result = await (runtime as any).onSystemTransform(
      { sessionID: 'ses_child', model: { providerID: 'test', modelID: 'test' } },
      { system: ['Base prompt.'] },
    );

    expect(result.system).toEqual(['Base prompt.']);
    expect(formatForSystem).not.toHaveBeenCalled();
    expect(sessionStore.get('ses_child')?.injectedRawText).toBeUndefined();
  });

  it('does not call buildEnrichedQuery for child sessions', async () => {
    const { runtime, sessionStore } = createRuntime({
      isChildSession: vi.fn().mockResolvedValue(true),
    });

    const buildEnrichedQuery = vi.spyOn(runtime as any, 'buildEnrichedQuery');

    sessionStore.upsert('ses_child2', (state) => {
      state.lastUserPrompt = 'hello';
      state.needsMemoryInjection = true;
    });

    await (runtime as any).onSystemTransform(
      { sessionID: 'ses_child2', model: { providerID: 'test', modelID: 'test' } },
      { system: ['Base prompt.'] },
    );

    expect(buildEnrichedQuery).not.toHaveBeenCalled();
  });
});
