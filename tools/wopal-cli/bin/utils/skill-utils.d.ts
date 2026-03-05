export interface SkillInfo {
    name: string;
    description?: string;
    path: string;
    status: 'downloaded' | 'installed';
}
export declare function parseSkillMd(skillMdPath: string): {
    name: string;
    description?: string;
} | null;
export declare function getSkillInfo(skillDir: string): SkillInfo | null;
export declare function collectSkills(dir: string, status: 'downloaded' | 'installed'): SkillInfo[];
export declare function getInstalledSkillsDir(): string;
export declare function mergeSkills(inboxSkills: SkillInfo[], installedSkills: SkillInfo[]): SkillInfo[];
//# sourceMappingURL=skill-utils.d.ts.map