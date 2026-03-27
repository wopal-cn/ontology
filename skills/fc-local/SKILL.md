---
name: fc-local
description: |
  Local web scraping & search tool. ⚠️ MUST use when: (1) Scrape/crawl web pages to Markdown, (2) Web search, (3) Batch scrape multiple URLs, (4) Generate LLMs.txt. 🔴 Trigger when user mentions URL scraping, site crawling, web search, or content extraction. 🔄 If anti-crawling blocks fc-local, auto-switch to CDP fallback (scrape-cdp.sh).
---

# fc-local — Local Web Scraping

CLI wrapper for web scraping and crawling.

## Prerequisites

### Core Commands

| Command | Description |
|---------|-------------|
| `fc-cli` | CLI for scrape/crawl operations |
| `my-fc` | Service manager (start/stop/status/health/logs) |
| `chrome_remote` | Chrome CDP manager (for anti-crawling fallback) |

### fc-local Service

```bash
my-fc status          # Check container health
my-fc health          # Full check (API + scrape test)
my-fc start           # Start Docker services
my-fc logs api 100    # View API logs
```

### CDP Fallback (Anti-crawling)

```bash
chrome_remote -b      # Start Chrome with remote debugging
chrome_remote status  # Check CDP status
chrome_remote stop    # Stop Chrome CDP
```

**Verify dependencies**:
```bash
which fc-cli my-fc chrome_remote agent-browser jq
```

## Command Matrix

| Need | Command | Options |
|------|---------|---------|
| Single page | `scrape <url>` | `--format`, `--clean`🤖, `--prompt`🤖 |
| Entire site | `crawl <url>` | `--limit`, `--wait`, `--clean`🤖 |
| Multiple URLs | `batch <file>` | `--wait` |
| Link discovery | `map <url>` | `--limit`, `--filter` |
| Web search | `search <query>` | `--limit` |
| LLMs.txt | `llmstxt <path>` | `--full` |
| Job status | `*-status <id>` | `--wait` |

🤖 = AI feature, high cost. Use only when user explicitly requests.

## Core Commands

### scrape — Single Page

```bash
fc-cli scrape <url> [-o docs/scraped/<name>.md] [--format markdown|html|links] [--clean] [--prompt <text>]
```

- `-o`: Output file path (recommended: `docs/scraped/<name>.md`)
- `--format`: Output format (default: markdown)
- `--clean`🤖: AI removes nav, ads, sidebars
- `--prompt`🤖: Custom AI processing (implies --clean)

### crawl — Website Crawling

```bash
fc-cli crawl <url> --limit <n> --wait [-o docs/scraped/<site>] [--clean] [--prompt <text>]
```

- `--limit`: Max pages to crawl
- `--wait`: Wait for completion
- `-o`: Output directory (recommended: `docs/scraped/<site>`)
- `--clean`🤖: AI content cleaning
- `--prompt`🤖: Custom AI processing

Output: Directory structure with `.md` files per page.

### batch — Multiple URLs

```bash
# Input: one URL per line or JSON array
fc-cli batch urls.txt --wait [-o results.json]
```

### map — Link Discovery

```bash
fc-cli map <url> [--limit <n>] [--filter <pattern>]
```

- `--filter`: Wildcard pattern (`*api*`, `*/docs/v1/*`)

### llmstxt — Generate LLMs.txt

```bash
# From URL
fc-cli llmstxt https://example.com

# From local directory
fc-cli llmstxt ./crawl-output [--full]
```

## Async Job Pattern

Most commands return job ID immediately. Use `--wait` for sync execution:

```bash
# Async
fc-cli crawl https://example.com
# Returns: job_abc123

# Check status
fc-cli crawl-status job_abc123

# Or sync mode
fc-cli crawl https://example.com --wait
```

Status commands: `crawl-status`, `batch-status`

## Global Options

| Option | Description |
|--------|-------------|
| `--api-url <url>` | Override API URL |
| `-o, --output <file>` | Save to file/directory |
| `-v, --verbose` | Detailed logging |

## 🚨 AI Features — STRICT RULES

**🔴 NEVER use AI options (`--clean`, `--prompt`) unless user EXPLICITLY requests them.**

| User says | Interpretation | Your action |
|-----------|----------------|-------------|
| "抓取这个页面" | Plain scrape | `fc-cli scrape <url>` |
| "结构化获取" | Markdown output (already structured) | `fc-cli scrape <url>` |
| "爬取整个网站" | Plain crawl | `fc-cli crawl <url>` |
| "用 AI 清理内容" | Explicit AI request | `fc-cli scrape <url> --clean` ✅ |

**Key principle**: `scrape` already returns structured Markdown. "结构化" ≠ AI extraction.

**AI options consume credits and are slower. Default to plain scrape/crawl.**

## Notes

- **Output directory**: Save scraped files to `docs/scraped/` using `-o` option
- **Speed**: Playwright renders 2-5s per page
- **Large sites**: Test with small `--limit` first

## Fallback: Agent-Browser CDP Mode

When fc-local fails due to anti-crawling (page keeps navigating, 403/500, captcha, empty content), use agent-browser with user's Chrome CDP.

**Anti-crawling indicators**:
- Playwright log: `page is navigating and changing the content`
- API returns 403/500 or captcha page
- Content is empty or shows "access denied"

### Quick Fallback (Recommended)

```bash
# From skill directory:
./scripts/scrape-cdp.sh "<url>" [-o docs/scraped/<name>.md]
```

The script automatically:
1. Starts `chrome_remote` if not running
2. Opens URL and waits for load
3. Extracts main content (excludes nav/footer/ads)
4. Saves as Markdown with title and metadata

### Manual Fallback

```bash
# 1. Start Chrome CDP
chrome_remote -b

# 2. Navigate and extract
agent-browser --cdp 9222 open "<url>"
agent-browser --cdp 9222 wait --load networkidle
agent-browser --cdp 9222 get text body > docs/scraped/<name>.md

# 3. Cleanup
chrome_remote stop
```

**Why this works**: `chrome_remote` uses user's real Chrome profile with cookies/login state, bypassing anti-bot detection.

## Troubleshooting

When commands fail or return unexpected results:

```bash
# Quick diagnostics
my-fc status              # Container health
my-fc health              # Full API test
my-fc logs api 100        # Recent API logs
my-fc logs playwright-service 50  # Playwright errors
```

**Common issues**:
- Empty content → Check playwright logs for anti-crawling errors → Use CDP fallback
- API not responding → `my-fc restart`
- Timeout → Increase `--timeout` or check site speed

👉 **Full guide**: `references/TROUBLESHOOTING.md`

## References

- Full API: `references/API_REFERENCE.md`
- Examples: `references/EXAMPLES.md`
- Troubleshooting: `references/TROUBLESHOOTING.md`
