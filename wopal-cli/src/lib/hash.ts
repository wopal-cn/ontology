import fs from "fs-extra";
import path from "path";
import crypto from "crypto";

/**
 * 计算技能文件夹的 SHA-256 哈希值
 *
 * 递归遍历文件夹，计算所有文件的哈希值，然后合并为一个最终的哈希
 * 排除 .git、node_modules 等目录
 *
 * @param skillPath 技能文件夹路径
 * @returns SHA-256 哈希值（十六进制字符串）
 */
export async function computeSkillFolderHash(
  skillPath: string,
): Promise<string> {
  const absolutePath = path.resolve(skillPath);

  if (!(await fs.pathExists(absolutePath))) {
    throw new Error(`Skill folder not found: ${absolutePath}`);
  }

  const files = await getAllFiles(absolutePath);
  const hashes: string[] = [];

  for (const file of files.sort()) {
    const content = await fs.readFile(file);
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    hashes.push(hash);
  }

  const combinedHash = crypto
    .createHash("sha256")
    .update(hashes.join(""))
    .digest("hex");

  return combinedHash;
}

/**
 * 递归获取所有文件
 *
 * @param dir 目录路径
 * @param baseDir 基础目录（用于计算相对路径）
 * @returns 文件路径数组
 */
async function getAllFiles(
  dir: string,
  baseDir: string = dir,
): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (shouldExcludeDir(entry.name)) {
        continue;
      }

      const subFiles = await getAllFiles(fullPath, baseDir);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * 判断目录是否应该被排除
 *
 * @param dirName 目录名
 * @returns 是否排除
 */
function shouldExcludeDir(dirName: string): boolean {
  const excludeDirs = [
    ".git",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    "dist",
    "build",
    ".next",
    ".nuxt",
  ];

  return excludeDirs.includes(dirName);
}
