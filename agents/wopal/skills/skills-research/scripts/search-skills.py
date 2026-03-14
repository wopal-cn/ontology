#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Search for skills from the skills.sh ecosystem."""

import argparse
import json
import re
import subprocess
import sys

ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;]*m")


def strip_ansi(text: str) -> str:
    """Remove ANSI escape codes from text."""
    return ANSI_ESCAPE.sub("", text)


def parse_search_output(output: str) -> list[dict]:
    """Parse npx skills find output into structured data."""
    results = []
    current_skill = None

    clean_output = strip_ansi(output)

    for line in clean_output.splitlines():
        line = line.strip()
        if not line:
            continue

        if line.startswith("Install with"):
            continue

        if line.startswith("└"):
            if current_skill:
                current_skill["url"] = line[1:].strip()
            continue

        match = re.match(r"^([^/]+/[^/@]+)@(\S+)", line)
        if match:
            if current_skill:
                results.append(current_skill)
            current_skill = {
                "owner_repo": match.group(1),
                "skill_name": match.group(2),
                "full_id": f"{match.group(1)}@{match.group(2)}",
                "url": None,
            }

    if current_skill:
        results.append(current_skill)

    return results


def search_skills(query: str, json_output: bool = False) -> int:
    """Search for skills using npx skills find."""
    cmd = ["npx", "skills", "find", query]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except subprocess.TimeoutExpired:
        print("Error: Search timed out", file=sys.stderr)
        return 1
    except FileNotFoundError:
        print("Error: npx not found. Please install Node.js.", file=sys.stderr)
        return 1

    output = result.stdout + result.stderr

    if json_output:
        skills = parse_search_output(output)
        print(json.dumps(skills, indent=2, ensure_ascii=False))
    else:
        print(output)

    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Search for skills from the skills.sh ecosystem"
    )
    parser.add_argument("query", nargs="+", help="Search query")
    parser.add_argument("--json", "-j", action="store_true", help="Output as JSON")

    args = parser.parse_args()
    query = " ".join(args.query)

    return search_skills(query, args.json)


if __name__ == "__main__":
    sys.exit(main())
