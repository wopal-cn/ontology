#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Download skills from GitHub to local INBOX directory."""

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def parse_github_url(url: str) -> dict | None:
    """Parse GitHub URL to extract owner, repo, and skill path."""
    patterns = [
        r"github\.com/([^/]+)/([^/]+)/tree/([^/]+)/(.+)",
        r"github\.com/([^/]+)/([^/]+)",
    ]

    for i, pattern in enumerate(patterns):
        match = re.search(pattern, url)
        if match:
            if i == 0:
                return {
                    "owner": match.group(1),
                    "repo": match.group(2),
                    "branch": match.group(3),
                    "path": match.group(4),
                }
            else:
                return {
                    "owner": match.group(1),
                    "repo": match.group(2),
                    "branch": "main",
                    "path": None,
                }
    return None


def parse_skill_id(skill_id: str) -> dict | None:
    """Parse skill identifier (owner/repo@skill)."""
    match = re.match(r"^([^/]+)/([^/@]+)@(.+)$", skill_id)
    if match:
        return {
            "owner": match.group(1),
            "repo": match.group(2),
            "skill_name": match.group(3),
        }
    return None


def find_skill_directories(repo_path: Path) -> list[Path]:
    """Find all directories containing SKILL.md."""
    skills = []
    for skill_md in repo_path.rglob("SKILL.md"):
        skills.append(skill_md.parent)
    return skills


def get_default_inbox() -> Path:
    """Get default INBOX path relative to project root."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            check=True,
        )
        project_root = Path(result.stdout.strip())
    except (subprocess.CalledProcessError, FileNotFoundError):
        script_dir = Path(__file__).parent
        project_root = script_dir.parent.parent.parent.parent.parent
    return project_root / "projects" / "agent-tools" / "skills" / "download" / "INBOX"


def download_skill(
    source: str,
    dest: Path,
    force: bool = False,
    verbose: bool = False,
) -> bool:
    """Download a skill from GitHub to destination directory."""
    parsed_url = parse_github_url(source)
    parsed_id = parse_skill_id(source)

    if not parsed_url and not parsed_id:
        print(f"Error: Invalid source format: {source}", file=sys.stderr)
        print("Expected: owner/repo@skill or GitHub URL", file=sys.stderr)
        return False

    if parsed_url:
        owner = parsed_url["owner"]
        repo = parsed_url["repo"]
        branch = parsed_url["branch"]
        skill_path_hint = parsed_url.get("path")
    elif parsed_id:
        owner = parsed_id["owner"]
        repo = parsed_id["repo"]
        branch = "main"
        skill_path_hint = None
    else:
        return False

    repo_url = f"https://github.com/{owner}/{repo}.git"

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        clone_path = tmp_path / repo

        if verbose:
            print(f"Cloning {repo_url}...")

        try:
            subprocess.run(
                [
                    "git",
                    "clone",
                    "--depth",
                    "1",
                    "-b",
                    branch,
                    repo_url,
                    str(clone_path),
                ],
                capture_output=True,
                check=True,
            )
        except subprocess.CalledProcessError as e:
            print(f"Error: Failed to clone repository: {e.stderr}", file=sys.stderr)
            return False

        skill_dirs = find_skill_directories(clone_path)

        if not skill_dirs:
            print("Error: No SKILL.md found in repository", file=sys.stderr)
            return False

        if skill_path_hint:
            skill_dirs = [
                d
                for d in skill_dirs
                if skill_path_hint in str(d.relative_to(clone_path))
            ]
            if not skill_dirs:
                print(
                    f"Warning: Skill path '{skill_path_hint}' not found",
                    file=sys.stderr,
                )

        if parsed_id and "skill_name" in parsed_id:
            target_name = parsed_id["skill_name"]
            skill_dirs = [d for d in skill_dirs if d.name == target_name]
            if not skill_dirs:
                print(
                    f"Warning: Skill '{target_name}' not found, using first match",
                    file=sys.stderr,
                )
                skill_dirs = find_skill_directories(clone_path)

        dest.mkdir(parents=True, exist_ok=True)
        downloaded = []

        for skill_dir in skill_dirs:
            skill_name = skill_dir.name
            target_path = dest / skill_name

            if target_path.exists():
                if force:
                    shutil.rmtree(target_path)
                else:
                    print(
                        f"Skipping {skill_name} (already exists, use --force to overwrite)"
                    )
                    continue

            shutil.copytree(skill_dir, target_path)
            downloaded.append(skill_name)
            print(f"Downloaded: {target_path}")

        if not downloaded:
            print("No skills were downloaded", file=sys.stderr)
            return False

        return True


def main():
    parser = argparse.ArgumentParser(
        description="Download skills from GitHub to local INBOX"
    )
    parser.add_argument(
        "source",
        help="Skill identifier (owner/repo@skill) or GitHub URL",
    )
    parser.add_argument(
        "--dest",
        "-d",
        help="Destination directory (default: projects/agent-tools/skills/download/INBOX)",
    )
    parser.add_argument(
        "--force",
        "-f",
        action="store_true",
        help="Overwrite existing skill",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show detailed output",
    )

    args = parser.parse_args()

    dest = Path(args.dest) if args.dest else get_default_inbox()

    success = download_skill(
        args.source,
        dest,
        args.force,
        args.verbose,
    )

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
