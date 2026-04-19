import { writeFileSync } from "fs";
import { createDebugLog } from "../debug.js";

const debugLog = createDebugLog("[wopal-task]", "task");

const SOUND_ENABLED = process.env.WOPAL_TASK_NOTIFY_SOUND !== "false";
const SOUND_PATH = "/System/Library/Sounds/Glass.aiff";

export function notifyTaskCompletion(sessionId: string): void {
  try {
    writeFileSync(`/tmp/opencode-done-${sessionId}`, "completed");
    debugLog(`Task completion marker created: /tmp/opencode-done-${sessionId}`);

    if (SOUND_ENABLED) {
      Bun.spawn(["afplay", SOUND_PATH], {
        stdout: "ignore",
        stderr: "ignore",
      });
    }
  } catch (e) {
    debugLog(`Task completion notification error: ${e instanceof Error ? e.message : String(e)}`);
  }
}
