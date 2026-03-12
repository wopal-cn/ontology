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
