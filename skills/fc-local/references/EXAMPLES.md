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

## Extract Structured Data 🤖

```bash
# Simple extraction
fc-cli extract https://github.com/user/repo --prompt "Extract repo name, stars, description" --wait

# Twitter/X tweets (100% success rate)
fc-cli extract https://x.com/user/status/123 \
  --prompt "Extract tweet content, author, timestamp" \
  --wait

# With JSON Schema
cat > schema.json << 'EOF'
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "price": { "type": "number" },
    "inStock": { "type": "boolean" }
  }
}
EOF

fc-cli extract https://example.com/product \
  --prompt "Extract product info" \
  --schema schema.json \
  --wait \
  -o product.json

# Multiple URLs
fc-cli extract \
  https://site1.com/page1 \
  https://site2.com/page2 \
  --prompt "Extract title and main content" \
  --wait \
  -o results.json
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
fc-cli extract https://github.com/modelcontextprotocol/servers \
  --prompt "Extract: name, description, stars, language, topics" \
  --wait \
  -o repo.json
```

### Workflow 3: Product Monitoring

```bash
# Create schema
cat > product-schema.json << 'EOF'
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "price": { "type": "number" },
    "availability": { "type": "string" }
  }
}
EOF

# Extract
fc-cli extract https://shop.example.com/product/123 \
  --schema product-schema.json \
  --wait
```

---

## Best Practices

1. **Test first**: Use `--limit 10` before full crawl
2. **Save output**: Always use `-o` for important results
3. **Use --clean**: Removes noise for better content
4. **Twitter/X**: Always use `extract` with `--prompt`
5. **Large sites**: Combine `--limit` with `--timeout`
