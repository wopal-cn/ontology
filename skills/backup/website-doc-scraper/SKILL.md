---
name: website-doc-scraper
description: Scrapes website pages to Markdown with state management and deduplication. Supports Fast Path (single page), Layer Mode (incremental crawling), and Site Mode (full discovery).
---

# Website Doc Scraper

Scrapes website documentation and saves as Markdown files.

**Default Output**: `docs/scraped/<domain>/`

## ⚠️ Critical: User Confirmation Required

**Before ANY batch scraping (Layer Mode or Site Mode), you MUST:**

1. **Ask user** what URL range to scrape
2. **Set path_filter** based on user requirements
3. **Show filter rules** and get **explicit confirmation**
4. **Only start scraping after confirmation**

**⛔ NEVER start batch scraping without user confirmation!**

### Common Filter Patterns

| Use Case | Pattern | Description |
|----------|---------|-------------|
| Docs only | `^/docs` | Match paths starting with `/docs` |
| Chinese docs | `^/docs/zh` | Match `/docs/zh` paths |
| English docs | `^/docs/en` | Match `/docs/en` paths |
| Exclude blog | `^(?!/blog).*` | Exclude `/blog` paths |
| Exclude multiple | `^(?!/blog\|/forum\|/api).*` | Exclude multiple paths |
| All pages | `^.*` | Or leave empty |

---

## Mode Selection

| Mode | Trigger | Description |
|------|---------|-------------|
| **Fast Path** | Single URL | Quick single page save |
| **Layer Mode** | "Scrape related pages" | Layer-by-layer with confirmation |
| **Site Mode** | "Full site", "all docs" | Complete site discovery |

---

## Scraping Strategy

### Batch Size Optimization

**Always use the largest batch size possible** (recommended: 20+ URLs per batch).

**Why?** Tavily's behavior depends on result size:

| Result Size | Tavily Behavior | Agent Handling |
|-------------|-----------------|----------------|
| **> 25k tokens** | Saves to file, returns file path | ✅ Use `save-batch --input-file` (efficient) |
| **≤ 25k tokens** | Returns JSON in response | ⚠️ Parse JSON manually (token-heavy, error-prone) |

**Best Practice:**
- **Prefer file-based results** - Larger batches → more likely to exceed 25k threshold → file output
- **Avoid small batches** - JSON responses consume context tokens and increase parsing errors
- **Batch size 20** is a good default balance between efficiency and API limits
- **Error Recovery** - If JSON parsing or file writing fails, spawn **multiple subagents in parallel**, each handling one URL

---

## Fast Path (Single Page)

1. **Get filename & Extract**:
   ```bash
   python ./scripts/state_manager.py get-filename --output-dir <dir> --url <url>
   ```
   Then use `tavily_extract(urls=[<url>], extract_depth="advanced")`.

2. **Save**: Write content to the `full_path` returned.

3. **Ask user**: *"Continue scraping more pages? Choose:\n1. Layer Mode (incremental crawling)\n2. Site Mode (full site discovery)\n3. Finish"*

If user chooses Layer Mode or Site Mode, import the page first:
```bash
python ./scripts/state_manager.py import-single --output-dir <dir> --url <url> --file <path>
```

Then follow the **User Confirmation Required** section above before proceeding.

---

## Layer Mode (Incremental Crawling)

**⛔ Confirm URL filter with user before starting! (See "Critical: User Confirmation Required" above)**

### Setup (First Time Only)
```bash
# Set path filter based on user-confirmed criteria
python ./scripts/state_manager.py set-path-filter --output-dir <dir> --pattern "<user-confirmed-pattern>"

# Verify and show to user
python ./scripts/state_manager.py stats --output-dir <dir>
```

### Layer Loop

For each layer N:

**1. Discover Links**
```bash
python ./scripts/state_manager.py get-base-url --output-dir <dir>
python ./scripts/extract_links.py <output-dir> --base-url <base_url> --include-internal --output /tmp/urls.txt
python ./scripts/state_manager.py add-urls --output-dir <dir> --urls-file /tmp/urls.txt
```

**2. Preview & Confirm**
```bash
python ./scripts/state_manager.py stats --output-dir <dir>
python ./scripts/state_manager.py preview --output-dir <dir> --size 10
```

⚠️ **WAIT for user confirmation** before scraping.

**3. Batch Scrape** (loop until queue empty)
```bash
# Get batch
python ./scripts/state_manager.py next-batch --output-dir <dir> --size 20

 # Extract with Tavily
 tavily_extract(urls=batch, extract_depth="advanced")

# Save results (choose one):
# Option A: If Tavily returns a file path
python ./scripts/state_manager.py save-batch --output-dir <dir> --input-file <file>

# Option B: If Tavily returns JSON content
# Save files directly, then mark as scraped
python ./scripts/state_manager.py mark-scraped --output-dir <dir> --urls <url1> <url2>
```

**4. Continue**: Ask "Continue to Layer N+1?" → repeat from step 1, or proceed to Link Verification.

### Termination

When no new links discovered → proceed to **Link Verification**.

---

## Site Mode (Full Site Discovery)

Use `tavily_map` for initial discovery, then iterate with Layer Mode for complete coverage.

**⛔ Confirm URL filter with user before starting! (See "Critical: User Confirmation Required" above)**

### Setup

```bash
# Initialize
python ./scripts/state_manager.py init --output-dir <dir> --base-url <url>

# Set filter based on user-confirmed criteria
python ./scripts/state_manager.py set-path-filter --output-dir <dir> --pattern "<user-confirmed-pattern>"

# Show to user and get confirmation
python ./scripts/state_manager.py stats --output-dir <dir>
```

Tell the user: *"✓ State manager initialized\n✓ Filter rule set: `<pattern>`\n\nConfirm to start site discovery?"*

**⛔ DO NOT proceed with site discovery until user explicitly confirms!**

### Execution

**1. Discover via Sitemap**
```
tavily_map(url=<base_url>, max_depth=2)
```
Then add discovered URLs:
```bash
python ./scripts/state_manager.py add-urls --output-dir <dir> --urls <url1> <url2> ...
```

**2. Hybrid Iteration** (recommended for complete coverage)

After scraping initial batch, extract links from scraped pages and add new URLs. Repeat until `pending_urls = 0`.

**3. Batch Scrape**: Same as Layer Mode step 3.

---

## Link Verification

After scraping completes:

```bash
# Check links (Requires all pending URLs to be scraped first!)
python ./scripts/check_markdown_links.py <output-dir>

# Fix links (absolute → relative, add .md, convert in-scope external links)
python ./scripts/fix_markdown_links.py <output-dir>

# Re-verify
python ./scripts/check_markdown_links.py <output-dir>
```

> **Note**: `check_markdown_links.py` will properly identify external links that are within the scraping scope. If they are already scraped, `fix_markdown_links.py` will convert them to internal relative links. If they are pending, the checker will alert you.

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `get-filename` | Get correct filename for URL |
| `get-base-url` | Get base URL from state |
| `init` | Initialize project state |
| `add-urls` | Add URLs to queue |
| `next-batch` | Get next batch |
| `save-batch` | Save Tavily results |
| `mark-scraped` | Mark URLs completed |
| `stats` | Show statistics |
| `preview` | Preview next batch |
| `set-path-filter` | **⚠️ Set path filter (REQUIRED before batch scraping!)** |

For detailed arguments and state file format, see `./references/scraper-guide.md`.
