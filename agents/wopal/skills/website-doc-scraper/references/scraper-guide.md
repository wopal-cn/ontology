# Website Doc Scraper - Reference Guide

This guide provides detailed command arguments, state file structure, and advanced usage for the `website-doc-scraper` skill.

---

## 1. State Manager Commands

All operations are managed via `{baseDir}/scripts/state_manager.py`.

### File Naming
```bash
python {baseDir}/scripts/state_manager.py get-filename --output-dir <dir> --url <url>
# Output: {"filename": "docs/index.md", "full_path": "/absolute/path/to/docs/index.md"}

# Naming rules:
# - Root URL (https://example.com/) → index.md
# - Directory URL (https://example.com/docs/) → docs/index.md
# - File URL (https://example.com/docs/intro) → docs/intro.md
```

### Statistics
```bash
python {baseDir}/scripts/state_manager.py stats --output-dir <dir>
# Output: {"total_scraped": 47, "total_failed": 0, "total_pending": 15}
```

### Initialization & Import
```bash
# Initialize new project
python {baseDir}/scripts/state_manager.py init --output-dir <dir> --base-url <url>

# Import single scraped page (Fast Path upgrade)
python {baseDir}/scripts/state_manager.py import-single --output-dir <dir> --url <url> --file <path>
```

### URL Management
```bash
# Add URLs from file
python {baseDir}/scripts/state_manager.py add-urls --output-dir <dir> --urls-file <file>

# Add URLs directly
python {baseDir}/scripts/state_manager.py add-urls --output-dir <dir> --urls <url1> <url2> ...

# Filter pending URLs by regex
python {baseDir}/scripts/state_manager.py filter-pending --output-dir <dir> --pattern "<regex>" --mode keep
# Use --mode remove to exclude matching URLs

# Preview next batch
python {baseDir}/scripts/state_manager.py preview --output-dir <dir> --size 20
```

### Batch Processing
```bash
# Get next batch (JSON output)
python {baseDir}/scripts/state_manager.py next-batch --output-dir <dir> --size 20 --format json

# Save from file (when Tavily returns file path)
python {baseDir}/scripts/state_manager.py save-batch --output-dir <dir> --input-file <json_file>

# Save from stdin
echo '{"results": [...]}' | python {baseDir}/scripts/state_manager.py save-batch --output-dir <dir> --stdin

# Mark URLs as scraped
python {baseDir}/scripts/state_manager.py mark-scraped --output-dir <dir> --urls <url1> <url2>

# Mark URLs as failed
python {baseDir}/scripts/state_manager.py mark-scraped --output-dir <dir> --failed <url>
```

### Path Filtering
```bash
# Set path filter (persists in state)
python {baseDir}/scripts/state_manager.py set-path-filter --output-dir <dir> --pattern "^/docs"

# Common patterns:
# ^/docs       - Only pages under /docs
# ^/(docs|api) - Multiple paths
# /en/         - Specific language version
```

---

## 2. State File Structure

State is saved in `.scraper-state.json` at the output directory root:

```json
{
  "version": "2.0",
  "base_url": "https://example.com",
  "domain": "example.com",
  "path_filter": "^/docs",
  "created_at": 1716880000.0,
  "updated_at": 1716883600.0,
  "scraped_urls": [
    "https://example.com/docs/intro",
    "https://example.com/docs/setup"
  ],
  "pending_urls": [
    "https://example.com/docs/advanced"
  ],
  "failed_urls": []
}
```

> **Note**: Statistics (`total_scraped`, `total_failed`, `total_pending`) are now computed dynamically via the `stats` command.

---

## 3. Link Extraction

Extract links from scraped Markdown files:

```bash
python {baseDir}/scripts/extract_links.py <output-dir> \
  --base-url <base_url> \
  --include-internal \
  --output /tmp/urls.txt
```

**Important**: The `--include-internal` flag is required to discover relative links (`../config`, `/docs/api`). Without it, Layer Mode may terminate prematurely.

---

## 4. Link Verification & Fixing

### Check Links
```bash
python {baseDir}/scripts/check_markdown_links.py <output-dir>
```

Reports:
- Valid links percentage
- Absolute path links (need conversion)
- Missing .md extensions
- Missing target files

### Fix Links
```bash
python {baseDir}/scripts/fix_markdown_links.py <output-dir>
```

Fixes:
- Absolute paths → relative paths
- Add .md extensions to internal links
- Preserve external links

---

## 5. Guidelines
 
 ### Token Safety
 - **NEVER read Tavily output files** with the Read tool (too large)
 - When Tavily returns a file path, use `save-batch` command directly
 - Agent should save content directly when JSON is small enough
 
 ### User Confirmation (CRITICAL)
 - **URL Filter**: MUST confirm `path_filter` with user BEFORE any batch scraping
 - **Layer Loop**: Confirm before starting each new layer
 - **Preview**: Always show stats/preview before batch scraping
 - **STOP**: Allow user to stop at any point
 
 ### Scraping Strategy
 - **Max Batch Size**: Prefer large batches (20+) to force Tavily to output files (saving tokens)
 - **File vs JSON**: File output is more reliable and token-efficient than JSON
 - **Error Recovery**: If JSON parsing fails, spawn **multiple subagents in parallel**, each handling one URL
 
 ### State Management
 - All progress saved in `.scraper-state.json`
 - Supports interruption and resumption
 - Automatic URL normalization and deduplication
 
 ### Domain Scope
 - Only scrapes pages within the base domain
 - 301 redirects to different domains are excluded
 
 ---

## 6. Advanced: Resuming Interrupted Tasks

```bash
# Check current state
python {baseDir}/scripts/state_manager.py stats --output-dir <dir>
python {baseDir}/scripts/state_manager.py preview --output-dir <dir>

# Continue from where you left off
python {baseDir}/scripts/state_manager.py next-batch --output-dir <dir>
```

## 7. Handling Large Tavily Results

When `tavily_extract` returns a file path instead of JSON:

```
"Output has been saved to /tmp/tavily_results_xyz.json"
```

Process directly without reading:
```bash
python {baseDir}/scripts/state_manager.py save-batch --output-dir <dir> --input-file /tmp/tavily_results_xyz.json
```
