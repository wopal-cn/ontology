import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';

export interface SkillMetadata {
  name: string;
  description: string;
  source: string;
  sourceUrl: string;
  skillPath: string;
  downloadedAt: string;
  skillFolderHash?: string | null;
  commit?: string;
  ref?: string;
  tag?: string;
}

export async function writeMetadata(skillDir: string, metadata: SkillMetadata): Promise<void> {
  const metadataPath = join(skillDir, '.source.json');
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
}

export async function readMetadata(skillDir: string): Promise<SkillMetadata | null> {
  try {
    const metadataPath = join(skillDir, '.source.json');
    const content = await readFile(metadataPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}
