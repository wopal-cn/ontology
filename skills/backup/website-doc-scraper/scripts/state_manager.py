#!/usr/bin/env python3
"""
state_manager.py - Centralized state management for Website Doc Scraper

Handles state persistence, URL normalization, batch generation, and content saving.
Implements the Dual-Mode Workflow (Fast Path -> Project Mode upgrade).
"""

import sys
import json
import argparse
import re
import time
from pathlib import Path
from urllib.parse import urlparse, urlunparse

# Constants
DEFAULT_BATCH_SIZE = 20
STATE_FILENAME = ".scraper-state.json"
IGNORE_EXTENSIONS = {
    '.pdf', '.zip', '.rar', '.tar', '.gz', '.7z',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
    '.mp3', '.mp4', '.avi', '.mov',
    '.exe', '.dmg', '.pkg', '.bin'
}

class ScraperState:
    def __init__(self, output_dir, base_url=None):
        self.output_dir = Path(output_dir)
        self.state_file = self.output_dir / STATE_FILENAME
        # Extract root URL if a full page URL was provided
        clean_base_url = self._extract_base_url(base_url) if base_url else None
        self.data = {
            "version": "2.0",
            "base_url": clean_base_url,
            "domain": self._extract_domain(base_url) if base_url else None,
            "path_filter": None,    # Optional path filter pattern (e.g., "^/docs")
            "created_at": time.time(),
            "updated_at": time.time(),
            "scraped_urls": [],     # List of successfully scraped URLs
            "pending_urls": [],     # Queue of URLs to scrape
            "failed_urls": []       # List of failed URLs
        }
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _extract_base_url(self, url):
        """Extract base URL (scheme + domain) from a full URL"""
        if not url:
            return None
        parsed = urlparse(url)
        return f"{parsed.scheme}://{parsed.netloc}"

    def _extract_domain(self, url):
        if not url:
            return None
        parsed = urlparse(url)
        return parsed.netloc

    def load(self):
        """Load state from file"""
        if self.state_file.exists():
            try:
                content = self.state_file.read_text(encoding='utf-8')
                self.data = json.loads(content)
                return True
            except Exception as e:
                print(f"Error loading state: {e}", file=sys.stderr)
                return False
        return False

    def save(self):
        """Save state to file"""
        self.data["updated_at"] = time.time()
        self.state_file.write_text(json.dumps(self.data, indent=2, ensure_ascii=False), encoding='utf-8')
        print(f"State saved to {self.state_file}")

    def normalize_url(self, url):
        """
        Normalize URL: strip fragments, unified trailing slash handling,
        remove .md extensions from internal links, fix nested paths
        """
        try:
            parsed = urlparse(url)
            # Remove fragment
            parsed = parsed._replace(fragment='')
            # Ensure scheme (default to https if missing but typically input has it)
            if not parsed.scheme:
                parsed = parsed._replace(scheme='https')

            # Fix nested path errors (e.g., /docs/xxx/docs/yyy -> /docs/xxx/yyy)
            path = parsed.path
            if path.count('/docs/') > 1:
                # Remove duplicate /docs/ segments
                parts = path.split('/')
                cleaned_parts = []
                seen_docs = False
                for part in parts:
                    if part == 'docs':
                        if not seen_docs:
                            cleaned_parts.append(part)
                            seen_docs = True
                    else:
                        cleaned_parts.append(part)
                path = '/'.join(cleaned_parts)
                parsed = parsed._replace(path=path)

            # Remove .md extension from internal links (same domain)
            if parsed.netloc == self.data.get("domain"):
                path = parsed.path
                if path.endswith('.md'):
                    path = path[:-3]
                    parsed = parsed._replace(path=path)

            clean_url = urlunparse(parsed)
            # Strip trailing slash unless it is just '/'
            if clean_url.endswith('/') and len(parsed.path) > 1:
                clean_url = clean_url.rstrip('/')

            return clean_url
        except Exception:
            return url

    def is_valid_url(self, url):
        """
        Check if URL is valid for scraping (domain scope, path filter, extension filter).

        Returns:
            bool: True if URL is valid, False otherwise
        """
        if not url:
            return False

        normalized = self.normalize_url(url)
        parsed = urlparse(normalized)

        # Domain check - CRITICAL: Always validate domain
        domain = self.data.get("domain")
        if not domain:
            # Domain must be set for security
            print(f"⚠️  WARNING: domain not set, rejecting URL: {url}", file=sys.stderr)
            return False

        if parsed.netloc != domain:
            return False

        # Path filter check (if configured)
        path_filter = self.data.get("path_filter")
        if path_filter:
            if not re.match(path_filter, parsed.path):
                return False

        # Extension check
        path = parsed.path.lower()
        if any(path.endswith(ext) for ext in IGNORE_EXTENSIONS):
            return False

        return True

    def import_single(self, url, filename):
        """Import a single manually scraped page into state (Fast Path upgrade)"""
        normalized = self.normalize_url(url)
        if normalized not in self.data["scraped_urls"]:
            self.data["scraped_urls"].append(normalized)
            print(f"Imported {normalized} as already scraped.")
        else:
            print(f"URL {normalized} already recorded.")

        # If base_url isn't set, extract root URL (scheme + domain)
        if not self.data.get("base_url"):
            self.data["base_url"] = self._extract_base_url(url)
            self.data["domain"] = self._extract_domain(url)

    def add_urls(self, urls):
        """Add discovered URLs to pending queue"""
        added_count = 0
        skipped_count = 0

        for url in urls:
            normalized = self.normalize_url(url)
            if not self.is_valid_url(normalized):
                skipped_count += 1
                parsed = urlparse(normalized)
                domain = self.data.get("domain")

                # Log why it was skipped
                if domain and parsed.netloc != domain:
                    print(f"Skipped: wrong domain {parsed.netloc} != {domain}: {url}", file=sys.stderr)
                continue

            if (normalized not in self.data["scraped_urls"] and
                normalized not in self.data["pending_urls"] and
                normalized not in self.data["failed_urls"]):
                self.data["pending_urls"].append(normalized)
                added_count += 1

        print(f"Added {added_count} new URLs, skipped {skipped_count} invalid URLs.")

    def filter_pending(self, pattern, mode='keep'):
        """Filter pending URLs based on regex pattern"""
        try:
            regex = re.compile(pattern)
        except re.error as e:
            print(f"Invalid regex pattern: {e}", file=sys.stderr)
            return

        initial_count = len(self.data["pending_urls"])
        new_pending = []

        for url in self.data["pending_urls"]:
            match = regex.search(url)
            if mode == 'keep':
                if match:
                    new_pending.append(url)
            elif mode == 'remove':
                if not match:
                    new_pending.append(url)

        # Also remove from failed list if we want to retry/filter?
        # No, usually we only filter pending.

        self.data["pending_urls"] = new_pending
        removed_count = initial_count - len(new_pending)
        print(f"Filtered pending URLs. Kept {len(new_pending)}, removed {removed_count}.")

    def get_next_batch(self, size=DEFAULT_BATCH_SIZE):
        """Get next batch of URLs to scrape"""
        batch = self.data["pending_urls"][:size]
        return batch

    def complete_batch(self, successful_urls, failed_urls=None):
        """Mark URLs as completed and handle state transitions"""
        failed_urls = failed_urls or []

        # Remove from pending
        for url in successful_urls + failed_urls:
            normalized = self.normalize_url(url)
            if normalized in self.data["pending_urls"]:
                self.data["pending_urls"].remove(normalized)

        # Process successful URLs
        for url in successful_urls:
            normalized = self.normalize_url(url)
            # Remove from failed if present (retry succeeded)
            if normalized in self.data["failed_urls"]:
                self.data["failed_urls"].remove(normalized)
            # Add to scraped
            if normalized not in self.data["scraped_urls"]:
                self.data["scraped_urls"].append(normalized)

        # Process failed URLs (with state correction)
        for url in failed_urls:
            normalized = self.normalize_url(url)
            # Remove from scraped if wrongly added (state correction)
            if normalized in self.data["scraped_urls"]:
                self.data["scraped_urls"].remove(normalized)
            # Add to failed
            if normalized not in self.data["failed_urls"]:
                self.data["failed_urls"].append(normalized)

    def preview_batch(self, size=DEFAULT_BATCH_SIZE):
        """Preview the next batch without modifying state"""
        batch = self.data["pending_urls"][:size]
        print(f"Preview of next {len(batch)} URLs:")
        for url in batch:
            print(f" - {url}")
        print(f"\nRemaining pending: {len(self.data['pending_urls']) - len(batch)}")

    def get_filename_for_url(self, url):
        """
        Generate the correct filename and path for a URL.
        Returns: dict with 'filename' (relative) and 'full_path' (absolute)
        """
        parsed = urlparse(url)

        # Determine if it's a directory-like URL (ends with /)
        is_directory_like = parsed.path.endswith('/')

        # Split path into parts, removing empty strings
        path_parts = [p for p in parsed.path.strip('/').split('/') if p]

        if not path_parts:
            # Root URL
            relative_path = Path("index.md")
        elif is_directory_like:
            # Directory URL -> folder/index.md
            relative_path = Path(*path_parts) / "index.md"
        else:
            # File URL -> folder/filename.md
            filename = path_parts[-1]
            parent_parts = path_parts[:-1]

            # Sanitize filename
            filename = re.sub(r'[^\w\-.]', '_', filename)

            if not filename.endswith('.md'):
                filename += '.md'

            if parent_parts:
                relative_path = Path(*parent_parts) / filename
            else:
                relative_path = Path(filename)

        full_path = self.output_dir / relative_path

        return {
            "filename": str(relative_path),
            "full_path": str(full_path.resolve())
        }

    def get_stats(self):
        """
        Get current statistics (dynamically computed).
        Returns: dict with statistics
        """
        return {
            "total_scraped": len(self.data["scraped_urls"]),
            "total_failed": len(self.data["failed_urls"]),
            "total_pending": len(self.data["pending_urls"])
        }

    def save_batch_content(self, results_data):
        """
        Process batch results from Tavily (JSON) and save to files.
        Input: JSON object (dict)
        Returns: (saved_files, failed_urls)
        """
        results = results_data.get("results", [])
        failed_results = results_data.get("failed_results", [])

        saved_files = []
        failed_urls = []

        # Collect failed URLs
        for item in failed_results:
            url = item.get("url")
            if url:
                failed_urls.append(url)
                error_msg = item.get("error", "Unknown error")
                print(f"Failed: {url} - {error_msg}", file=sys.stderr)

        for item in results:
            url = item.get("url")
            content = item.get("raw_content") or item.get("content")

            if not url or not content:
                continue

            # Generate filename and directory structure from URL
            parsed = urlparse(url)

            # Determine if it's a directory-like URL (ends with /)
            is_directory_like = parsed.path.endswith('/')

            # Split path into parts, removing empty strings
            path_parts = [p for p in parsed.path.strip('/').split('/') if p]

            if not path_parts:
                # Root URL
                relative_path = Path("index.md")
            elif is_directory_like:
                # Directory URL -> folder/index.md
                relative_path = Path(*path_parts) / "index.md"
            else:
                # File URL -> folder/filename.md
                # Check if last part already has extension
                filename = path_parts[-1]
                parent_parts = path_parts[:-1]

                # Sanitize filename
                filename = re.sub(r'[^\w\-.]', '_', filename)

                if not filename.endswith('.md'):
                    filename += '.md'

                relative_path = Path(*parent_parts) / filename

            # Construct full path
            file_path = self.output_dir / relative_path

            # Ensure parent directory exists
            file_path.parent.mkdir(parents=True, exist_ok=True)

            # Handle duplicates (only if file exists and we want to avoid overwrite)
            # Logic: append counter before extension
            counter = 1
            while file_path.exists():
                stem = file_path.stem
                if re.search(r'_\d+$', stem):
                    stem = re.sub(r'_\d+$', '', stem)
                file_path = file_path.with_name(f"{stem}_{counter}{file_path.suffix}")
                counter += 1

            try:
                file_path.write_text(content, encoding='utf-8')
                saved_files.append((url, str(file_path)))
                print(f"Saved: {file_path}")
            except Exception as e:
                print(f"Error saving {url}: {e}", file=sys.stderr)

        return saved_files, failed_urls


def main():
    parser = argparse.ArgumentParser(description="State Manager for Website Doc Scraper")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # Init command
    init_parser = subparsers.add_parser("init", help="Initialize new project state")
    init_parser.add_argument("--output-dir", required=True, help="Output directory")
    init_parser.add_argument("--base-url", required=True, help="Base URL for the project")

    # Import Single command
    import_parser = subparsers.add_parser("import-single", help="Import single scraped page")
    import_parser.add_argument("--output-dir", required=True, help="Output directory")
    import_parser.add_argument("--url", required=True, help="URL of the page")
    import_parser.add_argument("--file", help="Path to saved file (optional, for record)")

    # Add URLs command
    add_parser = subparsers.add_parser("add-urls", help="Add discovered URLs to pending")
    add_parser.add_argument("--output-dir", required=True, help="Output directory")
    add_parser.add_argument("--urls-file", help="File containing URLs (one per line)")
    add_parser.add_argument("--urls", nargs="+", help="List of URLs")

    # Filter Pending command
    filter_parser = subparsers.add_parser("filter-pending", help="Filter pending URLs by pattern")
    filter_parser.add_argument("--output-dir", required=True, help="Output directory")
    filter_parser.add_argument("--pattern", required=True, help="Regex pattern to filter by")
    filter_parser.add_argument("--mode", choices=["keep", "remove"], default="keep", help="Filter mode: keep (default) or remove matching URLs")

    # Preview command
    preview_parser = subparsers.add_parser("preview", help="Preview next batch")
    preview_parser.add_argument("--output-dir", required=True, help="Output directory")
    preview_parser.add_argument("--size", type=int, default=DEFAULT_BATCH_SIZE, help="Batch size")

    # Next Batch command
    batch_parser = subparsers.add_parser("next-batch", help="Get next batch for processing")
    batch_parser.add_argument("--output-dir", required=True, help="Output directory")
    batch_parser.add_argument("--size", type=int, default=DEFAULT_BATCH_SIZE, help="Batch size")
    batch_parser.add_argument("--format", choices=["json", "text"], default="json", help="Output format")

    # Save Batch command
    save_parser = subparsers.add_parser("save-batch", help="Save batch results from JSON")
    save_parser.add_argument("--output-dir", required=True, help="Output directory")
    save_parser.add_argument("--input-file", help="Input JSON file (from Tavily)")
    save_parser.add_argument("--stdin", action="store_true", help="Read JSON from stdin")

    # Mark Scraped command
    mark_parser = subparsers.add_parser("mark-scraped", help="Mark URLs as scraped or failed")
    mark_parser.add_argument("--output-dir", required=True, help="Output directory")
    mark_parser.add_argument("--urls", nargs="+", help="List of successfully scraped URLs")
    mark_parser.add_argument("--failed", nargs="+", help="List of failed URLs")

    # Get Filename command
    filename_parser = subparsers.add_parser("get-filename", help="Get correct filename for a URL")
    filename_parser.add_argument("--output-dir", required=True, help="Output directory")
    filename_parser.add_argument("--url", required=True, help="URL to get filename for")

    # Stats command
    stats_parser = subparsers.add_parser("stats", help="Get current statistics")
    stats_parser.add_argument("--output-dir", required=True, help="Output directory")

    # Get Base URL command
    base_url_parser = subparsers.add_parser("get-base-url", help="Get base URL from state")
    base_url_parser.add_argument("--output-dir", required=True, help="Output directory")

    # Fix Base URL command
    fix_base_url_parser = subparsers.add_parser("fix-base-url", help="Fix base_url to be root URL only")
    fix_base_url_parser.add_argument("--output-dir", required=True, help="Output directory")

    # Set Path Filter command
    path_filter_parser = subparsers.add_parser("set-path-filter", help="Set path filter pattern (e.g., '^/docs')")
    path_filter_parser.add_argument("--output-dir", required=True, help="Output directory")
    path_filter_parser.add_argument("--pattern", help="Regex pattern for path filtering (empty to remove filter)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    # Initialize state object (lazily loaded for most commands)
    state = ScraperState(args.output_dir)

    if args.command == "init":
        if state.state_file.exists():
            print(f"State file already exists at {state.state_file}")
            choice = input("Overwrite? (y/n): ")
            if choice.lower() != 'y':
                sys.exit(0)

        state = ScraperState(args.output_dir, args.base_url)

        # Validate that domain is set
        if not state.data.get("domain"):
            print(f"⚠️  ERROR: Failed to extract domain from base_url: {args.base_url}", file=sys.stderr)
            sys.exit(1)

        print(f"✓ Domain validated: {state.data['domain']}")
        state.save()

    elif args.command == "import-single":
        if not state.load():
            # Auto-init if not exists (Fast Path upgrade scenario)
            state = ScraperState(args.output_dir, args.url)
        state.import_single(args.url, args.file)
        state.save()

    elif args.command == "add-urls":
        if not state.load():
            print("State not found. Run init first.", file=sys.stderr)
            sys.exit(1)

        urls = []
        if args.urls:
            urls.extend(args.urls)
        if args.urls_file:
            path = Path(args.urls_file)
            if path.exists():
                content = path.read_text(encoding='utf-8')
                urls.extend([line.strip() for line in content.splitlines() if line.strip()])

        state.add_urls(urls)
        state.save()

    elif args.command == "filter-pending":
        if not state.load():
            print("State not found.", file=sys.stderr)
            sys.exit(1)

        state.filter_pending(args.pattern, args.mode)
        state.save()

    elif args.command == "preview":
        if not state.load():
            print("State not found.", file=sys.stderr)
            sys.exit(1)
        state.preview_batch(args.size)

    elif args.command == "next-batch":
        if not state.load():
            print("State not found.", file=sys.stderr)
            sys.exit(1)

        batch = state.get_next_batch(args.size)
        if args.format == "json":
            print(json.dumps({"batch": batch}))
        else:
            for url in batch:
                print(url)

    elif args.command == "save-batch":
        if not state.load():
            print("State not found.", file=sys.stderr)
            sys.exit(1)

        input_data = {}
        if args.stdin:
            try:
                content = sys.stdin.read()
                input_data = json.loads(content)
            except Exception as e:
                print(f"Error reading stdin: {e}", file=sys.stderr)
                sys.exit(1)
        elif args.input_file:
            try:
                content = Path(args.input_file).read_text(encoding='utf-8')
                input_data = json.loads(content)
            except Exception as e:
                print(f"Error reading input file: {e}", file=sys.stderr)
                sys.exit(1)

        saved_files, failed_urls = state.save_batch_content(input_data)
        successful_urls = [url for url, _ in saved_files]

        state.complete_batch(successful_urls, failed_urls)
        state.save()

        # Print summary
        if failed_urls:
            print(f"Completed: {len(saved_files)} saved, {len(failed_urls)} failed.")

    elif args.command == "mark-scraped":
        if not state.load():
            print("State not found.", file=sys.stderr)
            sys.exit(1)

        urls = args.urls or []
        failed = args.failed or []

        if not urls and not failed:
            print("Error: Must provide --urls or --failed (or both)", file=sys.stderr)
            sys.exit(1)

        state.complete_batch(urls, failed)
        state.save()
        print(f"Marked {len(urls)} as scraped, {len(failed)} as failed.")

    elif args.command == "get-filename":
        # get-filename does not require existing state
        result = state.get_filename_for_url(args.url)
        print(json.dumps(result))

    elif args.command == "stats":
        if not state.load():
            print("State not found.", file=sys.stderr)
            sys.exit(1)

        stats = state.get_stats()
        print(json.dumps(stats))

    elif args.command == "get-base-url":
        if state.load():
            result = {"base_url": state.data.get("base_url", "")}
        else:
            result = {"base_url": ""}
        print(json.dumps(result))

    elif args.command == "fix-base-url":
        if not state.load():
            print("State not found.", file=sys.stderr)
            sys.exit(1)

        old_base_url = state.data.get("base_url", "")
        new_base_url = state._extract_base_url(old_base_url)

        if old_base_url != new_base_url:
            state.data["base_url"] = new_base_url
            state.save()
            print(f"Fixed base_url: {old_base_url} -> {new_base_url}")
        else:
            print(f"base_url is already correct: {new_base_url}")

    elif args.command == "set-path-filter":
        if not state.load():
            print("State not found.", file=sys.stderr)
            sys.exit(1)

        old_filter = state.data.get("path_filter")
        new_filter = args.pattern if args.pattern else None

        if new_filter:
            # Validate regex pattern
            try:
                re.compile(new_filter)
            except re.error as e:
                print(f"Invalid regex pattern: {e}", file=sys.stderr)
                sys.exit(1)

        state.data["path_filter"] = new_filter
        state.save()

        if old_filter and new_filter:
            print(f"Updated path_filter: {old_filter} -> {new_filter}")
        elif new_filter:
            print(f"Set path_filter: {new_filter}")
        else:
            print(f"Removed path_filter (was: {old_filter})")

if __name__ == "__main__":
    main()
