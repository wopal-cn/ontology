#!/usr/bin/env python3
"""
extract_links.py - Extract links from Markdown/HTML files

This script scans Markdown files and extracts all hyperlinks.
It's designed to work with the Website Doc Scraper for discovering new pages to scrape.

Supports:
- External links (http/https URLs)
- Internal links (relative paths like ../config or /docs/api)
- Anchor links (skipped by default)
"""

import sys
import argparse
import re
from pathlib import Path
from typing import List, Set, Optional, Tuple
from urllib.parse import urljoin, urlparse


def is_external_link(url: str) -> bool:
    """Check if URL is an external link."""
    return url.startswith(('http://', 'https://'))


def is_special_link(url: str) -> bool:
    """Check if URL is a special protocol link (mailto, ftp, data, etc.)."""
    return url.startswith(('mailto:', 'ftp:', 'data:', 'javascript:', 'tel:'))


def is_anchor_link(url: str) -> bool:
    """Check if URL is a pure anchor link."""
    return url.startswith('#')


def resolve_internal_link(link_url: str, base_url: str, source_file_path: str = "") -> Optional[str]:
    """
    Convert an internal link to a full URL.

    Args:
        link_url: The relative or absolute path link (e.g., ../config, /docs/api)
        base_url: The base URL of the website (e.g., https://example.com)
        source_file_path: The path of the source file relative to root (for relative links)

    Returns:
        Full URL or None if the link should be skipped
    """
    # Remove fragment
    clean_url = link_url.split('#')[0].strip()

    if not clean_url:
        return None

    # Handle absolute path links (start with /)
    if clean_url.startswith('/'):
        return urljoin(base_url, clean_url)

    # Handle relative path links (../ or ./ or just path)
    if source_file_path:
        # Build the current page URL from base_url and source_file_path
        # Remove .md extension if present for URL construction
        source_path = source_file_path
        if source_path.endswith('.md'):
            source_path = source_path[:-3]
        current_url = urljoin(base_url.rstrip('/') + '/', source_path)
        return urljoin(current_url + '/', clean_url)

    # Fallback: just join with base_url
    return urljoin(base_url.rstrip('/') + '/', clean_url)


def extract_links_from_markdown(content: str, base_url: str = "", include_internal: bool = False, source_file_path: str = "") -> List[str]:
    """
    Extract all hyperlinks from Markdown content.

    Args:
        content: Markdown content to parse
        base_url: Base URL for converting internal links (required if include_internal=True)
        include_internal: Whether to include internal links (relative/absolute paths)
        source_file_path: Path of the source file relative to output dir (for relative link resolution)

    Returns:
        List of unique URLs found
    """
    # Pattern for Markdown links: [text](url)
    markdown_pattern = r'\[([^\]]+)\]\(([^\)]+)\)'

    # Pattern for HTML links: <a href="url">
    html_pattern = r'<a\s+[^>]*href=["\']([^"\']+)["\']'

    urls = set()

    def process_url(url: str) -> Optional[str]:
        """Process a URL and return it if valid, None otherwise."""
        url = url.strip()

        # Skip anchor-only links
        if is_anchor_link(url):
            return None

        # Skip special protocol links
        if is_special_link(url):
            return None

        # Handle external links
        if is_external_link(url):
            # Remove fragments
            clean_url = re.sub(r'#.*$', '', url)
            return clean_url if clean_url else None

        # Handle internal links (only if include_internal is True)
        if include_internal and base_url:
            resolved = resolve_internal_link(url, base_url, source_file_path)
            return resolved

        return None

    # Extract from Markdown links
    for match in re.finditer(markdown_pattern, content):
        url = match.group(2)
        processed = process_url(url)
        if processed:
            urls.add(processed)

    # Extract from HTML links
    for match in re.finditer(html_pattern, content):
        url = match.group(1)
        processed = process_url(url)
        if processed:
            urls.add(processed)

    return sorted(list(urls))


def extract_links_from_file(file_path: Path, base_url: str = "", include_internal: bool = False, output_dir: Path = None) -> List[str]:
    """
    Read a file and extract links.

    Args:
        file_path: Path to the file to read
        base_url: Base URL for converting internal links
        include_internal: Whether to include internal links
        output_dir: Output directory (used to calculate relative source path)
    """
    try:
        content = file_path.read_text(encoding='utf-8')

        # Calculate source file path relative to output_dir for relative link resolution
        source_file_path = ""
        if output_dir and include_internal:
            try:
                source_file_path = str(file_path.relative_to(output_dir))
            except ValueError:
                pass

        return extract_links_from_markdown(content, base_url, include_internal, source_file_path)
    except Exception as e:
        print(f"Error reading {file_path}: {e}", file=sys.stderr)
        return []


def extract_links_from_directory(dir_path: Path, pattern: str = "*.md", base_url: str = "", include_internal: bool = False) -> List[str]:
    """
    Extract links from all files matching a pattern in a directory.

    Args:
        dir_path: Directory to scan
        pattern: File pattern to match
        base_url: Base URL for converting internal links
        include_internal: Whether to include internal links
    """
    all_urls = set()

    for file_path in dir_path.rglob(pattern):
        print(f"Scanning: {file_path}")
        urls = extract_links_from_file(file_path, base_url, include_internal, dir_path)
        all_urls.update(urls)
        print(f"  Found {len(urls)} links")

    return sorted(list(all_urls))


def main():
    parser = argparse.ArgumentParser(description="Extract links from Markdown files")
    parser.add_argument("path", help="File or directory to scan")
    parser.add_argument("--pattern", default="*.md", help="File pattern to match (default: *.md)")
    parser.add_argument("--output", help="Output file to save URLs (one per line)")
    parser.add_argument("--base-url", help="Base URL for converting internal links (e.g., https://example.com)")
    parser.add_argument("--include-internal", action="store_true",
                        help="Include internal links (relative/absolute paths). Requires --base-url.")

    args = parser.parse_args()

    # Validate arguments
    if args.include_internal and not args.base_url:
        print("Error: --include-internal requires --base-url", file=sys.stderr)
        sys.exit(1)

    path = Path(args.path)

    if not path.exists():
        print(f"Error: {path} does not exist", file=sys.stderr)
        sys.exit(1)

    if path.is_file():
        urls = extract_links_from_file(path, args.base_url or "", args.include_internal, path.parent)
    else:
        urls = extract_links_from_directory(path, args.pattern, args.base_url or "", args.include_internal)

    print(f"\nTotal unique URLs found: {len(urls)}")

    if args.output:
        output_path = Path(args.output)
        output_path.write_text('\n'.join(urls), encoding='utf-8')
        print(f"Saved to: {output_path}")
    else:
        for url in urls:
            print(url)


if __name__ == "__main__":
    main()
