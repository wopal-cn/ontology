#!/bin/bash

# scrape-cdp.sh — Fallback scraper using agent-browser with Chrome CDP
# Usage: scrape-cdp.sh <url> [-o output.md]
#
# When fc-local fails due to anti-crawling, use this script to scrape
# via user's real Chrome browser (bypasses bot detection).

set -e

# Default output directory
OUTPUT_DIR="docs/scraped"
OUTPUT_FILE=""

# Parse arguments
URL=""
while [[ $# -gt 0 ]]; do
    case $1 in
        -o|--output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: scrape-cdp.sh <url> [-o output.md]"
            echo ""
            echo "Scrape a URL using agent-browser with Chrome CDP (fallback for anti-crawling sites)."
            echo ""
            echo "Options:"
            echo "  -o, --output <file>  Output file path (default: docs/scraped/<title>.md)"
            echo "  -h, --help           Show this help"
            exit 0
            ;;
        *)
            URL="$1"
            shift
            ;;
    esac
done

if [[ -z "$URL" ]]; then
    echo "Error: URL is required"
    exit 1
fi

# Check dependencies
if ! command -v agent-browser &>/dev/null; then
    echo "Error: agent-browser not found. Install with: npm i -g agent-browser"
    exit 1
fi

if ! command -v chrome_remote &>/dev/null; then
    echo "Error: chrome_remote not found in PATH"
    exit 1
fi

CDP_PORT=9222

# Check if Chrome CDP is already running
if ! lsof -i :$CDP_PORT &>/dev/null; then
    echo "→ Starting Chrome CDP..."
    chrome_remote -b
    # Wait for Chrome to be ready (max 10s)
    for i in {1..10}; do
        if lsof -i :$CDP_PORT &>/dev/null; then
            break
        fi
        sleep 1
    done
    if ! lsof -i :$CDP_PORT &>/dev/null; then
        echo "Error: Chrome CDP failed to start"
        exit 1
    fi
fi

# Navigate to URL
echo "→ Opening: $URL"
agent-browser --cdp $CDP_PORT open "$URL"
agent-browser --cdp $CDP_PORT wait --load networkidle

# Extract title and content
echo "→ Extracting content..."
CONTENT=$(agent-browser --cdp $CDP_PORT eval --stdin <<'EVALEOF'
(function() {
    // Try to find main content container
    const selectors = [
        'article',
        '[class*="article-content"]',
        '[class*="post-content"]',
        '[class*="entry-content"]',
        '[class*="main-content"]',
        'main',
        '.content'
    ];
    
    let mainEl = null;
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText.length > 200) {
            mainEl = el;
            break;
        }
    }
    
    // Fallback to body
    if (!mainEl) {
        mainEl = document.body;
    }
    
    // Get title
    const title = document.querySelector('h1')?.innerText || 
                  document.querySelector('title')?.innerText || 
                  'Untitled';
    
    // Clean content: remove nav, footer, sidebar, ads, breadcrumbs
    const clone = mainEl.cloneNode(true);
    const removeSelectors = [
        'nav', 'header', 'footer', 'aside',
        '[class*="breadcrumb"]', '[class*="crumb"]',
        '[class*="nav"]', '[class*="footer"]', '[class*="sidebar"]',
        '[class*="comment"]', '[class*="related"]', '[class*="recommend"]',
        '[class*="ad-"]', '[class*="ads-"]', '[id*="ad-"]',
        'script', 'style', 'noscript', 'iframe'
    ];
    clone.querySelectorAll(removeSelectors.join(', ')).forEach(el => el.remove());
    
    // Get clean text
    let text = clone.innerText;
    
    // Aggressive whitespace cleanup
    text = text
        .replace(/[ \t]+/g, ' ')                    // Collapse horizontal whitespace
        .replace(/\n[ \t]+/g, '\n')                 // Remove leading whitespace per line
        .replace(/[ \t]+\n/g, '\n')                 // Remove trailing whitespace per line
        .replace(/\n{3,}/g, '\n\n')                 // Max 2 consecutive newlines
        .replace(/^\s+|\s+$/g, '')                  // Trim start/end
        .split('\n')                                // Remove empty lines with only spaces
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
    
    return JSON.stringify({ title: title.trim(), content: text });
})()
EVALEOF
)

# Parse JSON result (agent-browser eval returns quoted JSON string)
# First unescape the outer quotes, then parse inner JSON
TITLE=$(echo "$CONTENT" | jq -r '.' 2>/dev/null | jq -r '.title' 2>/dev/null || echo "Untitled")
BODY=$(echo "$CONTENT" | jq -r '.' 2>/dev/null | jq -r '.content' 2>/dev/null)

# Sanitize title for filename
SAFE_TITLE=$(echo "$TITLE" | tr -cd '[:alnum:]._-' | tr ' ' '-' | cut -c1-50)

# Determine output file
if [[ -z "$OUTPUT_FILE" ]]; then
    mkdir -p "$OUTPUT_DIR"
    OUTPUT_FILE="$OUTPUT_DIR/${SAFE_TITLE}.md"
fi

# Write markdown
cat > "$OUTPUT_FILE" <<MDHEAD
# $TITLE

> Source: $URL
> Scraped: $(date '+%Y-%m-%d %H:%M')

---

$BODY
MDHEAD

echo "✅ Saved to: $OUTPUT_FILE"
echo ""
echo "To close Chrome CDP:"
echo "  chrome_remote stop"
