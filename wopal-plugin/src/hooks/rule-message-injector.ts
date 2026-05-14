import type { SessionStore } from "../session-store.js";
import type { DebugLog } from "../debug.js";
import type { MessageWithInfo } from "./message-context.js";
import type { RuleInjectorContext } from "./rule-injector.js";
import { injectRules } from "./rule-injector.js";
import { extractLatestUserPrompt } from "./message-context.js";

export interface RuleMessageInjectorContext {
  sessionStore: SessionStore;
  ruleInjectorCtx: RuleInjectorContext;
  rulesDebugLog: DebugLog;
  rulesInjectionEnabled: boolean;
}

export async function injectRulesToMessage(
  ctx: RuleMessageInjectorContext,
  sessionID: string,
  messages: MessageWithInfo[],
  lastUserMsg: MessageWithInfo | undefined,
): Promise<void> {
  if (!ctx.rulesInjectionEnabled) return;
  if (!lastUserMsg) return;

  const sessionState = ctx.sessionStore.get(sessionID);
  const contextPaths = sessionState
    ? Array.from(sessionState.contextPaths).sort()
    : [];
  const userPrompt = extractLatestUserPrompt(messages);

  const formattedRules = await injectRules(
    ctx.ruleInjectorCtx,
    contextPaths,
    userPrompt,
  );

  if (!formattedRules) return;

  lastUserMsg.parts ??= [];
  lastUserMsg.parts.push({
    type: "text",
    text: `<rules-context>\n${formattedRules}\n</rules-context>`,
    synthetic: true,
  });

  ctx.rulesDebugLog(`Injected rules for session ${sessionID}`);
}
