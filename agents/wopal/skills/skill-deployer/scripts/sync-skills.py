#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sync deployed skills with source directories."""

import argparse
import fnmatch
import hashlib
import json
import subprocess
from pathlib import Path


def parse_skillignore(skill_dir: Path) -> list[str]:
    """Parse .skillignore file.

    Args:
        skill_dir: Path to skill directory.

    Returns:
        List of ignore patterns.
    """
    ignore_file = skill_dir / ".skillignore"
    if not ignore_file.exists():
        return []
    patterns = []
    for line in ignore_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            patterns.append(line)
    return patterns


def calculate_content_hash(skill_dir: Path, ignore_patterns: list[str]) -> str:
    """Calculate SHA256 hash of skill directory contents.

    Args:
        skill_dir: Path to skill directory.
        ignore_patterns: Patterns to exclude from hash.

    Returns:
        Hexadecimal hash string.
    """
    hasher = hashlib.sha256()
    files = []

    for item in skill_dir.rglob("*"):
        if item.is_file():
            rel_path = item.relative_to(skill_dir)
            path_str = str(rel_path)
            ignored = False
            for pattern in ignore_patterns:
                if fnmatch.fnmatch(path_str, pattern) or fnmatch.fnmatch(
                    item.name, pattern
                ):
                    ignored = True
                    break
            if not ignored:
                files.append((path_str, item))

    files.sort(key=lambda x: x[0])
    for path_str, file_path in files:
        hasher.update(path_str.encode())
        hasher.update(file_path.read_bytes())

    return hasher.hexdigest()


def read_version_file(skill_dir: Path) -> dict | None:
    """Read version.json from skill directory.

    Args:
        skill_dir: Path to deployed skill directory.

    Returns:
        Version data dict or None if not exists.
    """
    version_file = skill_dir / "version.json"
    if not version_file.exists():
        return None
    return json.loads(version_file.read_text(encoding="utf-8"))


def check_sync(dest_dir: Path, root_dir: Path | None = None) -> dict:
    """Check sync status of all deployed skills.

    Args:
        dest_dir: Directory containing deployed skills.
        root_dir: Root directory for resolving relative source paths (defaults to cwd).

    Returns:
        Dict with keys: updated, unchanged, orphaned, untracked.
    """
    if root_dir is None:
        root_dir = Path.cwd()
    result = {
        "updated": [],
        "unchanged": [],
        "orphaned": [],
        "untracked": [],
    }

    if not dest_dir.exists():
        return result

    for skill_dir in dest_dir.iterdir():
        if not skill_dir.is_dir():
            continue
        if not (skill_dir / "SKILL.md").exists():
            continue

        version = read_version_file(skill_dir)
        if not version:
            result["untracked"].append(
                {
                    "name": skill_dir.name,
                    "path": str(skill_dir),
                }
            )
            continue

        if version.get("deploy_type") == "symlink":
            result["unchanged"].append(skill_dir.name)
            continue

        source_path_str = version["source_path"]
        if source_path_str.startswith("/"):
            source_path = Path(source_path_str)
        else:
            source_path = root_dir / source_path_str

        if not source_path.exists():
            result["orphaned"].append(
                {
                    "name": skill_dir.name,
                    "source": version["source_path"],
                }
            )
            continue

        patterns = parse_skillignore(source_path)
        current_hash = calculate_content_hash(source_path, patterns)

        if current_hash != version.get("content_hash", ""):
            result["updated"].append(
                {
                    "name": skill_dir.name,
                    "source": version["source_path"],
                    "old_hash": version.get("content_hash", "")[:8],
                    "new_hash": current_hash[:8],
                }
            )
        else:
            result["unchanged"].append(skill_dir.name)

    return result


def print_report(result: dict, dest_dir: Path) -> None:
    """Print sync status report.

    Args:
        result: Result dict from check_sync.
        dest_dir: Deployed skills directory.
    """
    print(f"Skills sync status ({dest_dir}):")
    print()

    if result["updated"]:
        print(f"  Updated ({len(result['updated'])}):")
        for item in result["updated"]:
            print(f"    - {item['name']}")
            print(f"      source: {item['source']}")
            print(f"      hash: {item['old_hash']} -> {item['new_hash']}")
        print()

    if result["orphaned"]:
        print(f"  Orphaned ({len(result['orphaned'])}):")
        for item in result["orphaned"]:
            print(f"    - {item['name']} (source: {item['source']})")
        print()

    if result["untracked"]:
        print(f"  Untracked ({len(result['untracked'])}):")
        for item in result["untracked"]:
            print(f"    - {item['name']}")
        print()

    print(f"  Unchanged: {len(result['unchanged'])}")


def _redeploy_skill(source_path: str, dest_dir: Path) -> bool:
    """Redeploy a skill using deploy-skill.py.

    Args:
        source_path: Source directory path.
        dest_dir: Target deployment directory.

    Returns:
        True if successful, False otherwise.
    """
    script_dir = Path(__file__).parent
    deploy_script = script_dir / "deploy-skill.py"

    result = subprocess.run(
        [
            "python3",
            str(deploy_script),
            "--source",
            source_path,
            "--dest",
            str(dest_dir),
            "--force",
        ],
        capture_output=True,
    )

    if result.returncode == 0:
        print(f"  Updated: {source_path}")
        return True
    else:
        print(f"  Failed: {source_path}")
        return False


def interactive_update(dest_dir: Path, updated: list[dict]) -> None:
    """Interactive update outdated skills.

    Args:
        dest_dir: Deployed skills directory.
        updated: List of skills with updates available.
    """
    for i, item in enumerate(updated):
        print(f"\n[{i + 1}/{len(updated)}] {item['name']}")
        print(f"  source: {item['source']}")
        print(f"  hash: {item['old_hash']} -> {item['new_hash']}")

        choice = input("Update? [y/N/a(all)/q(quit)]: ").strip().lower()

        if choice == "q":
            break
        elif choice == "a":
            for remaining in updated[i:]:
                _redeploy_skill(remaining["source"], dest_dir)
            break
        elif choice == "y":
            _redeploy_skill(item["source"], dest_dir)


def main():
    parser = argparse.ArgumentParser(description="Sync deployed skills")
    parser.add_argument(
        "--dest",
        "-d",
        default=".agents/skills/",
        help="Deployed skills directory",
    )
    parser.add_argument(
        "--root",
        "-r",
        default=None,
        help="Root directory for resolving relative source paths (defaults to auto-detect workspace root)",
    )
    parser.add_argument("--json", action="store_true", help="JSON output")
    parser.add_argument("--update", action="store_true", help="Interactive update")

    args = parser.parse_args()

    dest_dir = Path(args.dest)

    if args.root:
        root_dir = Path(args.root)
    else:
        root_dir = Path.cwd()
        while root_dir.parent != root_dir:
            if (root_dir / "projects").exists():
                break
            root_dir = root_dir.parent

    result = check_sync(dest_dir, root_dir)

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print_report(result, dest_dir)

        if args.update and result["updated"]:
            print()
            interactive_update(dest_dir, result["updated"])


if __name__ == "__main__":
    main()
