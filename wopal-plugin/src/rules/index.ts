/**
 * Rules subsystem - unified exports
 */

// From discoverer
export {
  discoverRuleFiles,
  parseRuleMetadata,
  clearRuleCache,
  getCachedRule,
  stripFrontmatter,
  type DiscoveredRule,
  type RuleMetadata,
} from "./discoverer.js";

// From matcher
export {
  promptMatchesKeywords,
  toolsMatchAvailable,
  fileMatchesGlobs,
} from "./matcher.js";

// From formatter
export { readAndFormatRules } from "./formatter.js";

// From path-extractor
export {
  extractFilePathsFromMessages,
  type Message,
  type MessagePart,
} from "./path-extractor.js";