# fc-local CLI Examples

## Quick Start

```bash
# Check service
my-fc status

# Test CLI
fc-cli --help
```

---

## Scrape Single Page

```bash
# Basic
fc-cli scrape https://example.com

# Save to file
fc-cli scrape https://example.com -o page.md

# Get HTML
fc-cli scrape https://example.com --format html

# Get all links
fc-cli scrape https://example.com --format links

# AI-cleaned content 🤖 (removes nav, ads, sidebars)
fc-cli scrape https://example.com --clean

# Custom AI processing 🤖
fc-cli scrape https://example.com --prompt "Extract only the product description"
```

---

## Crawl Website

```bash
# Basic crawl (returns job ID)
fc-cli crawl https://docs.example.com

# Wait for completion
fc-cli crawl https://docs.example.com --wait

# Limit pages
fc-cli crawl https://docs.example.com --limit 50 --wait

# Custom output directory
fc-cli crawl https://docs.example.com --limit 100 --wait -o ./my-docs

# With AI cleaning
fc-cli crawl https://docs.example.com --limit 50 --clean --wait

# Check status
fc-cli crawl-status <job_id>
```

---

## Batch Scrape

```bash
# Create URL list
cat > urls.txt << 'EOF'
https://example.com/page1
https://example.com/page2
https://example.com/page3
EOF

# Run batch
fc-cli batch urls.txt --wait -o results.json

# Or JSON array input
cat > urls.json << 'EOF'
["https://example.com/a", "https://example.com/b"]
EOF
fc-cli batch urls.json --wait
```

---

## Map Links

```bash
# All links
fc-cli map https://example.com

# Limit results
fc-cli map https://example.com --limit 50

# Filter by pattern (wildcard)
fc-cli map https://example.com --filter "*docs*"
fc-cli map https://example.com --filter "*/api/v1/*"
```

---

## Search

```bash
fc-cli search "web scraping best practices" --limit 5
```

---

## Generate LLMs.txt

```bash
# From URL
fc-cli llmstxt https://example.com

# From crawled directory
fc-cli crawl https://docs.example.com --wait -o ./docs
fc-cli llmstxt ./docs --full
```

---

## Real-World Workflows

### Workflow 1: Documentation Site

```bash
# Crawl with limits
fc-cli crawl https://docs.python.org/3/ \
  --limit 200 \
  --clean \
  --wait \
  -o ./python-docs

# Generate LLMs.txt
fc-cli llmstxt ./python-docs --full
```

### Workflow 2: GitHub Repo Info

```bash
fc-cli scrape https://github.com/modelcontextprotocol/servers -o repo.md
```

### Workflow 3: Product Monitoring

```bash
# Scrape product page
fc-cli scrape https://shop.example.com/product/123 -o product.md
```

---

## Best Practices

1. **Test first**: Use `--limit 10` before full crawl
2. **Save output**: Always use `-o` for important results
3. **Use --clean**: Removes noise for better content
4. **Large sites**: Combine `--limit` with `--timeout`
