export interface Skill {
  name: string;
  description: string;
  path: string;
  rawContent?: string;
  pluginName?: string;
  metadata?: Record<string, unknown>;
}

export interface ParsedSource {
  type: "github" | "gitlab" | "git" | "local" | "well-known";
  url: string;
  subpath?: string;
  localPath?: string;
  ref?: string;
  skillFilter?: string;
}

export interface WellKnownSkillEntry {
  name: string;
  description?: string;
  files?: string[];
}

export interface WellKnownIndex {
  skills: WellKnownSkillEntry[];
}

export interface WellKnownSkill {
  name: string;
  description: string;
  files: Map<string, string>;
  sourceUrl: string;
}
