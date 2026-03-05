import { existsSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
export function getInboxDir() {
    return process.env.SKILL_INBOX_DIR || join(homedir(), '.wopal', 'skills', 'INBOX');
}
export function getDirectorySize(dirPath) {
    if (!existsSync(dirPath))
        return 0;
    let size = 0;
    const files = readdirSync(dirPath);
    for (const file of files) {
        const filePath = join(dirPath, file);
        const stats = statSync(filePath);
        if (stats.isDirectory()) {
            size += getDirectorySize(filePath);
        }
        else {
            size += stats.size;
        }
    }
    return size;
}
export function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}
export function buildDirectoryTree(dirPath, prefix = '') {
    if (!existsSync(dirPath))
        return '';
    const files = readdirSync(dirPath);
    let tree = '';
    files.forEach((file, index) => {
        const filePath = join(dirPath, file);
        const stats = statSync(filePath);
        const isLast = index === files.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        tree += `${prefix}${connector}${file}\n`;
        if (stats.isDirectory()) {
            const newPrefix = prefix + (isLast ? '    ' : '│   ');
            tree += buildDirectoryTree(filePath, newPrefix);
        }
    });
    return tree;
}
//# sourceMappingURL=inbox-utils.js.map