import { spawnSync } from 'child_process';
import pc from 'picocolors';
let logger;
export function setLogger(l) {
    logger = l;
}
export function registerPassthroughCommand(program) {
    program
        .command('find [query]')
        .description('Search for skills (via Skills CLI)')
        .action(async (query) => {
        await passthroughFind(query || '');
    });
}
async function passthroughFind(query) {
    logger?.log(`Passthrough find: ${query}`);
    const args = ['-y', 'skills', 'find'];
    if (query) {
        args.push(query);
    }
    const result = spawnSync('npx', args, {
        stdio: 'inherit',
        shell: process.platform === 'win32'
    });
    if (result.error) {
        console.error(pc.red('Skills CLI 执行失败'));
        logger?.error(`Skills CLI error: ${result.error}`);
        process.exit(1);
    }
    if (result.status !== 0) {
        console.error(pc.red('Skills CLI 执行失败'));
        process.exit(result.status || 1);
    }
}
//# sourceMappingURL=passthrough.js.map