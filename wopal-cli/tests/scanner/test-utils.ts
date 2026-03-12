import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export async function createMockSkill(
  files: Record<string, string>,
): Promise<string> {
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "skill-check-"),
  );

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(tempDir, filePath);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, content);
  }

  return tempDir;
}

export async function cleanupMockSkill(dir: string): Promise<void> {
  await fs.promises.rm(dir, { recursive: true, force: true });
}
