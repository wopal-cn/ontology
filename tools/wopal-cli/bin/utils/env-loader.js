import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import dotenv from 'dotenv';
export function loadEnv(debug = false) {
    const envPath = debug
        ? join(process.cwd(), '.env')
        : join(homedir(), '.wopal', '.env');
    if (existsSync(envPath)) {
        const result = dotenv.config({ path: envPath });
        if (result.error) {
            console.error(`Failed to load .env from ${envPath}:`, result.error);
        }
    }
}
//# sourceMappingURL=env-loader.js.map