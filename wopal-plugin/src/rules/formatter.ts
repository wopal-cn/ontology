/**
 * Rule formatting for system prompt injection
 */

import { createDebugLog } from "../debug.js";
import { getCachedRule, type DiscoveredRule } from "./discoverer.js";
import { fileMatchesGlobs, promptMatchesKeywords } from "./matcher.js";

const debugLog = createDebugLog();

/**
 * Read and format rule files for system prompt injection
 * @param files - Array of discovered rule files with paths
 * @param contextFilePaths - Optional array of file paths from conversation context (used to filter conditional rules)
 * @param userPrompt - Optional user prompt text (used for keyword matching)
 * @param availableToolIDs - Optional array of available tool IDs (used for tool-based filtering)
 */
export async function readAndFormatRules(
  files: DiscoveredRule[],
  contextFilePaths?: string[],
  userPrompt?: string,
  availableToolIDs?: string[],
): Promise<string> {
  if (files.length === 0) {
    return "";
  }

  const ruleContents: string[] = [];
  const availableToolSet =
    availableToolIDs && availableToolIDs.length > 0
      ? new Set(availableToolIDs)
      : undefined;

  for (const { filePath, relativePath } of files) {
    // Use cached rule data with mtime-based invalidation
    const cachedRule = await getCachedRule(filePath);
    if (!cachedRule) {
      continue; // Error already logged by getCachedRule
    }

    const { metadata, strippedContent } = cachedRule;

    // Rules with metadata (globs, keywords, or tools) require matching
    // OR logic: rule applies if keywords match OR globs match OR tools match
    if (metadata?.globs || metadata?.keywords || metadata?.tools) {
      let globsMatch = false;
      let keywordsMatch = false;
      let toolsMatch = false;

      // Check globs against context file paths
      if (metadata.globs && contextFilePaths && contextFilePaths.length > 0) {
        globsMatch = contextFilePaths.some((contextPath) =>
          fileMatchesGlobs(contextPath, metadata.globs!),
        );
      }

      // Check keywords against user prompt
      if (metadata.keywords && userPrompt) {
        keywordsMatch = promptMatchesKeywords(userPrompt, metadata.keywords);
      }

      // Check tools against available tool IDs
      if (metadata.tools && availableToolSet) {
        toolsMatch = metadata.tools.some((tool) => availableToolSet.has(tool));
      }

      // If rule has conditions but none match, skip it
      if (!globsMatch && !keywordsMatch && !toolsMatch) {
        continue;
      }

      debugLog(
        `Including conditional rule: ${relativePath} (globs: ${globsMatch}, keywords: ${keywordsMatch}, tools: ${toolsMatch})`,
      );
    }

    // Use cached stripped content for output
    // Use relativePath for unique headings instead of just filename
    ruleContents.push(`## ${relativePath}\n\n${strippedContent}`);
  }

  if (ruleContents.length === 0) {
    return "";
  }

  return (
    `# OpenCode Rules\n\nPlease follow the following rules:\n\n` +
    ruleContents.join("\n\n---\n\n")
  );
}