#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""List available skills in a local directory."""

import argparse
import json
import os
import re
import sys
from pathlib import Path


def parse_skill_frontmatter(skill_md: Path) -> dict | None:
    """Parse SKILL.md frontmatter to extract name and description."""
    try:
        content = skill_md.read_text(encoding="utf-8")
        if not content.startswith("---"):
            return None

        end_idx = content.find("---", 3)
        if end_idx == -1:
            return None

        frontmatter = content[3:end_idx].strip()
        result = {}

        for line in frontmatter.split("\n"):
            if ":" in line:
                key, value = line.split(":", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                result[key] = value

        return result
    except Exception:
        return None


def find_skills(directory: Path) -> list[dict]:
    """Find all skills in a directory."""
    skills = []

    if not directory.exists():
        return skills

    for item in directory.iterdir():
        if item.is_dir():
            skill_md = item / "SKILL.md"
            if skill_md.exists():
                frontmatter = parse_skill_frontmatter(skill_md)
                skills.append(
                    {
                        "name": frontmatter.get("name", item.name)
                        if frontmatter
                        else item.name,
                        "directory_name": item.name,
                        "path": str(item),
                        "description": frontmatter.get("description", "")
                        if frontmatter
                        else "",
                    }
                )

    return sorted(skills, key=lambda x: x["name"].lower())


def expand_path(path: str) -> Path:
    """Expand ~ and environment variables in path."""
    return Path(os.path.expandvars(os.path.expanduser(path)))


def main():
    parser = argparse.ArgumentParser(description="List available skills in a directory")
    parser.add_argument(
        "--dir", "-d", required=True, help="Directory to scan for skills"
    )
    parser.add_argument(
        "--format", "-f", choices=["text", "json"], default="text", help="Output format"
    )

    args = parser.parse_args()

    directory = expand_path(args.dir)
    skills = find_skills(directory)

    if not skills:
        if args.format == "json":
            print("[]")
        else:
            print(f"No skills found in {directory}")
        return

    if args.format == "json":
        print(json.dumps(skills, indent=2, ensure_ascii=False))
    else:
        print(f"Skills in {directory}:")
        print()
        for skill in skills:
            print(f"  {skill['name']}")
            print(f"    Path: {skill['path']}")
            if skill["description"]:
                desc = skill["description"]
                if len(desc) > 100:
                    desc = desc[:97] + "..."
                print(f"    Desc: {desc}")
            print()


if __name__ == "__main__":
    main()
