/**
 * Rule formatting for system prompt injection
 */

import { getCachedRule, type DiscoveredRule } from "./discoverer.js";
import { fileMatchesGlobs, promptMatchesKeywords } from "./matcher.js";

/**
 * Matched rule description for logging
 */
export interface MatchedRuleInfo {
  name: string;
  reason: string;
}

/**
 * Result of readAndFormatRules
 */
export interface FormattedRulesResult {
  /** Formatted rules content for injection */
  content: string;
  /** Array of matched rule info for logging (e.g. rule name with match reason) */
  matchedRules: MatchedRuleInfo[];
}

/**
 * Read and format rule files for system prompt injection
 * @param files - Array of discovered rule files with paths
 * @param contextFilePaths - Optional array of file paths from conversation context (used to filter conditional rules)
 * @param userPrompt - Optional user prompt text (used for keyword matching)
 * @param availableToolIDs - Optional array of available tool IDs (used for tool-based filtering)
 * @returns Object with formatted content and matched rules info
 */
export async function readAndFormatRules(
  files: DiscoveredRule[],
  contextFilePaths?: string[],
  userPrompt?: string,
  availableToolIDs?: string[],
): Promise<FormattedRulesResult> {
  if (files.length === 0) {
    return { content: "", matchedRules: [] };
  }

  const ruleContents: string[] = [];
  const matchedRules: MatchedRuleInfo[] = [];
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
      const matchReasons: string[] = [];

      // Check globs against context file paths
      if (metadata.globs && contextFilePaths && contextFilePaths.length > 0) {
        const matchingGlobs = metadata.globs.filter((glob) =>
          contextFilePaths.some((contextPath) =>
            fileMatchesGlobs(contextPath, [glob]),
          ),
        );
        if (matchingGlobs.length > 0) {
          matchReasons.push(`globs: ${matchingGlobs.join(", ")}`);
        }
      }

      // Check keywords against user prompt
      if (metadata.keywords && userPrompt) {
        const matchingKeywords = metadata.keywords.filter((keyword) =>
          promptMatchesKeywords(userPrompt, [keyword]),
        );
        if (matchingKeywords.length > 0) {
          matchReasons.push(`keyword: ${matchingKeywords.join(", ")}`);
        }
      }

      // Check tools against available tool IDs
      if (metadata.tools && availableToolSet) {
        const matchingTools = metadata.tools.filter((tool) =>
          availableToolSet.has(tool),
        );
        if (matchingTools.length > 0) {
          matchReasons.push(`tools: ${matchingTools.join(", ")}`);
        }
      }

      // If rule has conditions but none match, skip it
      if (matchReasons.length === 0) {
        continue;
      }

      matchedRules.push({
        name: relativePath,
        reason: matchReasons.join("; "),
      });
    } else {
      // Unconditional rule (no metadata) - always included
      matchedRules.push({ name: relativePath, reason: "unconditional" });
    }

    // Use cached stripped content for output
    // Use relativePath for unique headings instead of just filename
    ruleContents.push(`## ${relativePath}\n\n${strippedContent}`);
  }

  if (ruleContents.length === 0) {
    return { content: "", matchedRules: [] };
  }

  const content =
    `# OpenCode Rules\n\nPlease follow the following rules:\n\n` +
    ruleContents.join("\n\n---\n\n");

  return { content, matchedRules };
}