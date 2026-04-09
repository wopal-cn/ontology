const fs = require('fs');

export const TaskNotifyPlugin = async ({ $ }) => {
    return {
        event: async ({ event }) => {
            if (event.type === "session.idle") {
                (async () => {
                    try {
                        const sessionId = process.env.PROCESS_ADAPTER_SESSION_ID;

                        if (sessionId) {
                            fs.writeFileSync(`/tmp/opencode-done-${sessionId}`, 'completed');
                            console.log(`[TaskNotifyPlugin] Mark file created: /tmp/opencode-done-${sessionId}`);
                        }

                        await $`afplay /System/Library/Sounds/Glass.aiff`;
                    } catch (e) {
                        console.error("[TaskNotifyPlugin] Error:", e);
                    }
                })();
            }
        },
    }
}
