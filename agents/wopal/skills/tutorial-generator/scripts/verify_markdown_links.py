#!/usr/bin/env python3
"""
Markown Link Validator & Fixer

This script recursively scans a directory of Markdown files to verify internal links.
It checks for:
- Broken file paths (relative and absolute within the project)
- Broken anchors (headers within files)

It supports an `--auto-fix` mode to attempt to resolve broken file links by searching
for a unique file with the same name in the scanned directory tree.

Usage:
    python3 verify_markdown_links.py <target_directory> [--fix]
"""

import os
import re
import argparse
import sys
from pathlib import Path
from collections import defaultdict
from urllib.parse import unquote

# ANSI colors for output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def print_color(text, color=Colors.ENDC):
    print(f"{color}{text}{Colors.ENDC}")

# Regex patterns
# 1. Standard inline links: [text](link) or [text](link "title")
#    Capture group 2 is the link.
LINK_PATTERN = re.compile(r'\[([^\]]+)\]\(([^)"]+)(?: \"[^\"]+\")?\)')

# 2. Reference-style links: [text]: link
#    Capture group 2 is the link.
REF_LINK_PATTERN = re.compile(r'^\[([^\]]+)\]:\s*(\S+)', re.MULTILINE)

# 3. Header pattern for anchor validation: # Header Text
#    Matches standard markdown headers.
HEADER_PATTERN = re.compile(r'^(#{1,6})\s+(.*)', re.MULTILINE)

# 4. HTML anchor pattern: <a id="anchor-name"></a> or <div id="anchor-name">
HTML_ID_PATTERN = re.compile(r'id=["\']([^"\']+)["\']')


class LinkValidator:
    def __init__(self, root_dir, auto_fix=False):
        self.root_dir = Path(root_dir).resolve()
        self.auto_fix = auto_fix
        self.file_index = {}        # { relative_path_str: absolute_Path_obj }
        self.filename_index = defaultdict(list) # { filename: [absolute_Path_objs] }
        self.anchor_cache = {}      # { absolute_path_str: set(anchors) }
        self.issues_count = 0
        self.fixed_count = 0

    def build_index(self):
        """
        Phase 1: Pre-scan & Indexing
        Builds a map of all files to optimize existence checks.
        """
        print_color(f"Building file index for {self.root_dir}...", Colors.OKBLUE)
        count = 0
        for root, _, files in os.walk(self.root_dir):
            for file in files:
                if file.startswith('.'): continue # Skip hidden files
                
                abs_path = Path(root) / file
                rel_path = abs_path.relative_to(self.root_dir)
                
                self.file_index[str(rel_path)] = abs_path
                self.filename_index[file].append(abs_path)
                count += 1
        
        print_color(f"Indexed {count} files.", Colors.OKGREEN)

    def get_anchors_from_file(self, file_path):
        """
        Extracts anchor IDs (headers and HTML ids) from a file.
        Uses caching to avoid re-reading files.
        """
        path_str = str(file_path)
        if path_str in self.anchor_cache:
            return self.anchor_cache[path_str]

        anchors = set()
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # 1. Headers to slug anchors
            # GitHub/CommonMark slugification: lowercase, remove non-alphanum (keep spaces/hyphens), replace spaces with hyphens
            for match in HEADER_PATTERN.finditer(content):
                header_text = match.group(2).strip()
                # Basic slugification logic (simplified for common cases)
                slug = header_text.lower()
                slug = re.sub(r'[^\w\s-]', '', slug) # Remove non-word chars except space and hyphen
                slug = re.sub(r'\s+', '-', slug)     # Replace space with hyphen
                anchors.add(slug)
            
            # 2. HTML IDs
            for match in HTML_ID_PATTERN.finditer(content):
                anchors.add(match.group(1))

        except Exception as e:
            print_color(f"Error reading file {file_path}: {e}", Colors.WARNING)
        
        self.anchor_cache[path_str] = anchors
        return anchors

    def resolve_path(self, link, current_file):
        """
        Resolves a link to an absolute path.
        Handles:
        - Absolute links (starting with /) -> relative to root_dir? No, usually relative to system root or project root. 
          Here we assume standard relative links mostly.
        - Relative links (../foo/bar.md)
        """
        # Remove anchor and query params
        path_part = link.split('#')[0].split('?')[0]
        anchor_part = link.split('#')[1] if '#' in link else None
        
        path_part = unquote(path_part) # Handle %20 etc

        target_path = None
        
        if not path_part:
            # Anchor only link to self
            target_path = current_file
        elif path_part.startswith('/'):
            # Absolute path relative to scan root (common convention in static sites)
            # Try joining with root_dir
            potential_path = self.root_dir / path_part.lstrip('/')
            if potential_path.exists():
                target_path = potential_path
        else:
            # Relative path
            potential_path = (current_file.parent / path_part).resolve()
            if potential_path.exists():
                target_path = potential_path
            # Check if it was meant to be relative to root (fallback)
            elif (self.root_dir / path_part).exists():
                 target_path = self.root_dir / path_part

        return target_path, anchor_part, path_part

    def find_fix(self, broken_filename):
        """
        Attempts to find a unique file with the same name in the index.
        """
        candidates = self.filename_index.get(broken_filename)
        if candidates and len(candidates) == 1:
            return candidates[0]
        return None

    def validate_file(self, file_path):
        """
        Scans a single file for links and validates them.
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            original_content = content
        except Exception as e:
            print_color(f"Could not read {file_path}: {e}", Colors.FAIL)
            return

        # Prepare for fixes
        modifications = [] # List of (start_idx, end_idx, new_text) -> naive replacement won't work easily with multiple changes
        # Better: replacements dictionary or rebuilding content?
        # Since we use regex iterators, we can collect replacements and apply them reverse order.

        replacements = []

        # Find all links
        # Combined iterator for both inline and reference links?
        # Handling them separately for simplicity.

        # 1. Inline links
        for match in LINK_PATTERN.finditer(content):
            full_match = match.group(0)
            link_url = match.group(2)
            
            # Skip external links, mailto, etc.
            if link_url.startswith(('http://', 'https://', 'mailto:', 'ftp://')):
                continue

            target_path, anchor, path_part = self.resolve_path(link_url, file_path)

            if target_path:
                # File exists, check anchor if present
                if anchor:
                    # Only check anchors for Markdown files
                    if target_path.suffix.lower() == '.md':
                        anchors = self.get_anchors_from_file(target_path)
                        if anchor not in anchors:
                            print_color(f"[Broken Anchor] In {file_path.relative_to(self.root_dir)}", Colors.WARNING)
                            print(f"  Link: {link_url}")
                            print(f"  Target: {target_path.relative_to(self.root_dir)}")
                            print(f"  Anchor #{anchor} not found in target.")
                            self.issues_count += 1
            else:
                # File does not exist
                print_color(f"[Broken Link] In {file_path.relative_to(self.root_dir)}", Colors.FAIL)
                print(f"  Link: {link_url}")
                self.issues_count += 1

                # Attempt Auto-Fix
                if self.auto_fix and path_part:
                    broken_filename = Path(path_part).name
                    fix_target = self.find_fix(broken_filename)
                    if fix_target:
                        # Calculate new relative path
                        # os.path.relpath(target, start)
                        new_rel_path = os.path.relpath(fix_target, file_path.parent)
                        if anchor:
                            new_rel_path += f"#{anchor}"
                        
                        print_color(f"  -> Auto-fixing to: {new_rel_path}", Colors.OKGREEN)
                        
                        # We need to replace the link part in the match
                        # match.start(2) is start of link group, match.end(2) is end
                        replacements.append((match.start(2), match.end(2), new_rel_path))
                        self.fixed_count += 1
                    else:
                        print(f"  -> Could not auto-fix (ambiguous or not found: {broken_filename})")

        # Apply fixes if any
        if replacements and self.auto_fix:
            # Sort replacements by start index in reverse to avoid shifting offsets
            replacements.sort(key=lambda x: x[0], reverse=True)
            
            new_content = list(content)
            for start, end, new_text in replacements:
                new_content[start:end] = list(new_text)
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write("".join(new_content))

    def run(self):
        self.build_index()
        
        scan_files = []
        for root, _, files in os.walk(self.root_dir):
            for file in files:
                if file.endswith('.md'):
                    scan_files.append(Path(root) / file)
        
        print_color(f"Scanning {len(scan_files)} Markdown files...", Colors.OKBLUE)
        
        for file_path in scan_files:
            self.validate_file(file_path)
        
        print("-" * 30)
        if self.issues_count == 0:
             print_color("Traffic Light: GREEN. No broken links found.", Colors.OKGREEN)
        else:
             print_color(f"Traffic Light: RED. Found {self.issues_count} broken links/anchors.", Colors.FAIL)
             if self.auto_fix:
                 print_color(f"Auto-fixed {self.fixed_count} links.", Colors.OKGREEN)

def main():
    parser = argparse.ArgumentParser(description="Verify internal Markdown links.")
    parser.add_argument("target_dir", help="Directory to scan")
    parser.add_argument("--fix", action="store_true", help="Attempt to auto-fix broken file links")
    
    args = parser.parse_args()
    
    if not os.path.isdir(args.target_dir):
        print_color(f"Error: Directory {args.target_dir} does not exist.", Colors.FAIL)
        sys.exit(1)
        
    validator = LinkValidator(args.target_dir, args.fix)
    validator.run()

if __name__ == "__main__":
    main()
