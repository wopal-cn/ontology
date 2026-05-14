import type { SessionStore } from "../session-store.js";
import type { DebugLog } from "../debug.js";
import type { MessageWithInfo } from "./message-context.js";

export interface SkillReloadInjectorContext {
  sessionStore: SessionStore;
  contextDebugLog: DebugLog;
}

export async function injectSkillReload(
  ctx: SkillReloadInjectorContext,
  sessionID: string,
  lastUserMsg: MessageWithInfo | undefined,
): Promise<void> {
  if (!lastUserMsg) return;

  const skillsToReload = ctx.sessionStore.consumeSkillReload(sessionID);
  if (!skillsToReload || skillsToReload.length === 0) return;

  const reminderText = [
    "<system-reminder>",
    `上下文已被压缩，之前加载的技能 [${skillsToReload.join(", ")}] 内容已丢失。`,
    "请重新加载这些技能以恢复完整的指令和工具链。",
    "</system-reminder>",
  ].join("\n");

  lastUserMsg.parts ??= [];
  lastUserMsg.parts.push({
    type: "text",
    text: reminderText,
    synthetic: true,
  });

  ctx.contextDebugLog(
    `Injected Skill Reload for session ${sessionID}: ${skillsToReload.join(", ")}`,
  );
}
