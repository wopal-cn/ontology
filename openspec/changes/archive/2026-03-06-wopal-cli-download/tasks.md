## 1. Setup & Dependencies

- [x] 1.1 Install required dependencies (simple-git, gray-matter)
- [x] 1.2 Create utils directory structure (`src/utils/`)
- [x] 1.3 Copy git.ts from Skills CLI to utils/git.ts
- [x] 1.4 Copy source-parser.ts from Skills CLI to utils/source-parser.ts
- [x] 1.5 Copy skills.ts from Skills CLI to utils/skills.ts
- [x] 1.6 Adapt copied modules for wopal-cli (remove telemetry, adjust imports)

## 2. Source Parsing Enhancement

- [x] 2.1 Implement comma-separated skill parsing in download command
- [x] 2.2 Add URL format support (GitHub/GitLab with @skill)
- [x] 2.3 Add branch support in URL parsing (tree/branch@skill)
- [x] 2.4 Test source parsing with all supported formats

## 3. Download Command Core

- [x] 3.1 Create src/commands/download.ts skeleton
- [x] 3.2 Implement single skill download logic
- [x] 3.3 Implement clone repo → discover skills → copy to INBOX flow
- [x] 3.4 Add --force option to overwrite existing skills
- [x] 3.5 Implement temp directory cleanup (try-finally)

## 4. Batch Download

- [x] 4.1 Implement source grouping by owner/repo
- [x] 4.2 Implement concurrent download (Promise.all with max 3)
- [x] 4.3 Handle partial download failures (some succeed, some fail)
- [x] 4.4 Display progress for batch downloads

## 5. Metadata & File Management

- [x] 5.1 Parse SKILL.md to extract name and description
- [x] 5.2 Create .source.json metadata file
- [x] 5.3 Include all required fields (name, description, source, sourceUrl, skillPath, downloadedAt)
- [x] 5.4 Ensure metadata is created even if SKILL.md is missing

## 6. Error Handling

- [x] 6.1 Handle "skill not found" error with available skills list
- [x] 6.2 Handle "repo not found or access denied" error
- [x] 6.3 Handle network errors with retry suggestion
- [x] 6.4 Handle "skill already exists" error with --force hint
- [x] 6.5 Handle invalid source format with usage examples
- [x] 6.6 Reject local paths with install command suggestion

## 7. Help & Documentation

- [x] 7.1 Implement --help with complete usage information
- [x] 7.2 Include SOURCE FORMAT section with all supported formats
- [x] 7.3 Include BATCH DOWNLOAD section with examples
- [x] 7.4 Include EXAMPLES section with common use cases
- [x] 7.5 Include OPTIONS section (--force, --help)
- [x] 7.6 Include NOTES section (INBOX workflow)
- [x] 7.7 Include WORKFLOW section (find → download → scan → install)

## 8. Output Formatting

- [x] 8.1 Format single skill download success message
- [x] 8.2 Format batch download success message with count
- [x] 8.3 Format error messages with color and clarity
- [x] 8.4 Display skill list when skill not found

## 9. Testing & Validation

- [x] 9.1 Test download with GitHub shorthand (owner/repo@skill)
- [x] 9.2 Test download with GitHub URL
- [x] 9.3 Test download with GitLab URL
- [x] 9.4 Test download with GitLab subgroup
- [x] 9.5 Test batch download (space-separated)
- [x] 9.6 Test batch download (comma-separated)
- [x] 9.7 Test batch download (mixed formats)
- [x] 9.8 Test --force option
- [x] 9.9 Test error scenarios (skill not found, repo not found, network error)
- [x] 9.10 Verify metadata file creation

## 10. Integration

- [x] 10.1 Register download command in CLI
- [x] 10.2 Verify INBOX path from SKILL_INBOX_DIR environment variable
- [x] 10.3 Test with wopal skills find output (end-to-end)
- [x] 10.4 Verify compatibility with future install command
