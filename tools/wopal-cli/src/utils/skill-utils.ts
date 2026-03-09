import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";
import matter from "gray-matter";
import { homedir } from "os";
import { getConfig } from "./config.js";

export interface SkillInfo {
  name: string;
  description?: string;
  path: string;
  status: "downloaded" | "installed";
}

export function parseSkillMd(
  skillMdPath: string,
): { name: string; description?: string } | null {
  if (!existsSync(skillMdPath)) return null;

  const content = readFileSync(skillMdPath, "utf-8");
  const { data } = matter(content);

  return {
    name: data.name || "",
    description: data.description,
  };
}

export function getSkillInfo(skillDir: string): SkillInfo | null {
  const skillMdPath = join(skillDir, "SKILL.md");
  const parsed = parseSkillMd(skillMdPath);

  if (!parsed || !parsed.name) return null;

  return {
    name: parsed.name,
    description: parsed.description,
    path: skillDir,
    status: "downloaded",
  };
}

export function collectSkills(
  dir: string,
  status: "downloaded" | "installed",
): SkillInfo[] {
  const skills: SkillInfo[] = [];

  if (!existsSync(dir)) return skills;

  const entries = readdirSync(dir);

  for (const entry of entries) {
    const skillPath = join(dir, entry);
    const stats = statSync(skillPath);

    if (stats.isDirectory()) {
      const skillInfo = getSkillInfo(skillPath);
      if (skillInfo) {
        skillInfo.status = status;
        skills.push(skillInfo);
      }
    }
  }

  return skills;
}

export function getInstalledSkillsDir(): string {
  return getConfig().getSkillsInstallDir();
}

export function mergeSkills(
  inboxSkills: SkillInfo[],
  installedSkills: SkillInfo[],
): SkillInfo[] {
  const skillMap = new Map<string, SkillInfo>();

  for (const skill of [...inboxSkills, ...installedSkills]) {
    const existing = skillMap.get(skill.name);
    if (!existing || skill.status === "installed") {
      skillMap.set(skill.name, skill);
    }
  }

  return Array.from(skillMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
