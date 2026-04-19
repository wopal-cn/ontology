/**
 * Rule matching utilities for conditional rule filtering
 */

import { minimatch } from "minimatch";

/**
 * Check if a file path matches any of the given glob patterns
 */
export function fileMatchesGlobs(filePath: string, globs: string[]): boolean {
  return globs.some((glob) => minimatch(filePath, glob, { matchBase: true }));
}

/**
 * Check if a user prompt matches any of the given keywords.
 * Supports:
 * - Case-insensitive matching
 * - Wildcard `*` for flexible matching (e.g., "开发*技能" matches "开发一个技能")
 * - Smart word boundary detection: English keywords use `\b`, Chinese/CJK use substring matching
 * - Mixed language keywords: boundary behavior determined by first character
 *
 * @param prompt - The user's prompt text
 * @param keywords - Array of keywords to match
 * @returns true if any keyword matches the prompt
 */
export function promptMatchesKeywords(
  prompt: string,
  keywords: string[],
): boolean {
  const lowerPrompt = prompt.toLowerCase();

  return keywords.some((keyword) => {
    const lowerKeyword = keyword.toLowerCase();

    // Split by wildcard '*' and escape regex special characters in each part
    const parts = lowerKeyword.split("*");
    const escapedParts = parts.map((part) =>
      part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"),
    );
    let regexPattern = escapedParts.join(".*");

    // Smart boundary handling:
    // Only add leading word boundary (\b) if:
    // 1. Keyword does NOT start with '*' (explicit wildcard means no boundary restriction)
    // 2. First character is ASCII letter/number/underscore (English-style keyword)
    // For Chinese/CJK characters or keywords starting with '*', use lenient matching
    if (!lowerKeyword.startsWith("*")) {
      const firstChar = lowerKeyword.charAt(0);
      if (/^[a-z0-9_]/i.test(firstChar)) {
        regexPattern = "\\b" + regexPattern;
      }
    }

    const regex = new RegExp(regexPattern, "i");
    return regex.test(lowerPrompt);
  });
}

/**
 * Check if any of the required tools are available.
 * Uses exact string matching (OR logic: any match returns true).
 *
 * @param availableToolIDs - Array of tool IDs currently available
 * @param requiredTools - Array of tool IDs from rule metadata
 * @returns true if any required tool is available
 */
export function toolsMatchAvailable(
  availableToolIDs: string[],
  requiredTools: string[],
): boolean {
  if (requiredTools.length === 0) {
    return false;
  }
  // Create a Set for O(1) lookups
  const availableSet = new Set(availableToolIDs);
  return requiredTools.some((tool) => availableSet.has(tool));
}