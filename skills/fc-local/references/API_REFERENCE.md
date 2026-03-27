# fc-local CLI API Reference

## Global Options

| Option | Env Variable | Description | Default |
|--------|--------------|-------------|---------|
| `--api-url <url>` | `FC_API_URL` | API base URL (local: http://localhost:3002) | - |
| `-o, --output <file>` | - | Save output to file | stdout |
| `-v, --verbose` | - | Verbose logging | false |
| `-i, --interactive` | - | Enter REPL mode | - |

---

## Commands

### scrape

Scrape a single URL.

```bash
fc-cli scrape <url> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--format <type>` | Output: markdown, html, links | markdown |
| `--clean` | AI removes nav, ads, sidebars | false |
| `--prompt <text>` | Custom AI processing (implies --clean) | - |

### crawl

Crawl entire website.

```bash
fc-cli crawl <url> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--limit <n>` | Max pages | 100 |
| `--timeout <ms>` | Timeout per page | 60000 |
| `--wait` | Wait for completion | false |
| `--clean` | AI content cleaning | false |
| `--prompt <text>` | Custom AI processing | - |

**Output** (with `--wait`): Creates directory with `.md` files.

### crawl-status

Check crawl job status.

```bash
fc-cli crawl-status <job_id>
```

### batch

Scrape multiple URLs from file.

```bash
fc-cli batch <file> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--wait` | Wait for completion | false |
| `--poll-interval <s>` | Polling interval | 2 |
| `--timeout <s>` | Timeout | 120 |

**Input formats**:
- Plain text: one URL per line
- JSON array: `["url1", "url2"]`

### batch-status

Check batch job status.

```bash
fc-cli batch-status <job_id> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--wait` | Wait for completion | false |
| `--poll-interval <s>` | Polling interval | 2 |
| `--timeout <s>` | Timeout | 120 |

### map

Discover links on website.

```bash
fc-cli map <url> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--limit <n>` | Max links | 100 |
| `--filter <pattern>` | URL filter (wildcard `*`) | - |

### search

Web search.

```bash
fc-cli search <query> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--limit <n>` | Number of results | 5 |

### llmstxt

Generate LLMs.txt for website or directory.

```bash
fc-cli llmstxt <path> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--full` | Also generate llms-full.txt | false |

**Modes**:
- URL mode: Fetch from website via API
- Directory mode: Scan local `.md` files

---

## REPL Mode

```bash
fc-cli --interactive
```

Available: `scrape`, `search`, `crawl`, `crawl-status`, `map`, `batch`, `batch-status`, `llmstxt`, `exit`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Service not running | `my-fc status` then `my-fc start` |
| API errors | Check `--verbose` output |
| Rate limits | Reduce concurrency or add delays |
