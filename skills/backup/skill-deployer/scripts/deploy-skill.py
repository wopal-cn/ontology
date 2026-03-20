#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Deploy AI agent skills from source to target directory."""

import argparse
import fnmatch
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path


def parse_skillignore(skill_dir: Path) -> list[str]:
    """Parse .skillignore file and return list of patterns."""
    ignore_file = skill_dir / ".skillignore"
    if not ignore_file.exists():
        return []

    patterns = []
    for line in ignore_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            patterns.append(line)
    return patterns


def should_ignore(path: Path, relative_path: str, patterns: list[str]) -> bool:
    """Check if a path should be ignored based on patterns."""
    if not patterns:
        return False

    name = path.name
    for pattern in patterns:
        if pattern.endswith("/"):
            if path.is_dir() and fnmatch.fnmatch(name, pattern[:-1]):
                return True
        elif fnmatch.fnmatch(name, pattern):
            return True
        elif fnmatch.fnmatch(relative_path, pattern):
            return True

    return False


def copy_skill(source: Path, target: Path, patterns: list[str]) -> None:
    """Copy skill directory, excluding files matching ignore patterns."""
    for item in source.iterdir():
        relative_path = item.name
        if should_ignore(item, relative_path, patterns):
            continue

        target_item = target / item.name

        if item.is_dir():
            target_item.mkdir(exist_ok=True)
            copy_skill_recursive(item, target_item, patterns, relative_path)
        else:
            shutil.copy2(item, target_item)


def copy_skill_recursive(
    source_dir: Path, target_dir: Path, patterns: list[str], base_path: str
) -> None:
    """Recursively copy directory contents, respecting ignore patterns."""
    for item in source_dir.iterdir():
        relative_path = f"{base_path}/{item.name}"
        if should_ignore(item, relative_path, patterns):
            continue

        target_item = target_dir / item.name

        if item.is_dir():
            target_item.mkdir(exist_ok=True)
            copy_skill_recursive(item, target_item, patterns, relative_path)
        else:
            shutil.copy2(item, target_item)


def validate_skill_dir(path: Path) -> bool:
    """Check if directory contains a valid skill (has SKILL.md)."""
    skill_md = path / "SKILL.md"
    return skill_md.exists()


def _calculate_content_hash(skill_dir: Path, ignore_patterns: list[str]) -> str:
    """Calculate SHA256 hash of skill directory contents.

    Args:
        skill_dir: Path to skill source directory.
        ignore_patterns: Patterns to exclude from hash calculation.

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


INBOX_DIR_NAME = "INBOX"
UNIVERSAL_DIR_NAME = "universal"


def _is_in_inbox(source: Path) -> bool:
    """Check if source is in INBOX directory."""
    return INBOX_DIR_NAME in source.resolve().parts


def _move_to_universal(source: Path, skill_name: str) -> Path | None:
    """Move skill from INBOX to sibling universal directory.

    Universal directory contains accepted/installed skills that are
    ready for deployment. This works by replacing INBOX with universal
    in the path.

    Args:
        source: Source directory in INBOX.
        skill_name: Name of the skill.

    Returns:
        New path in universal directory, or None if not moved.
    """
    source = source.resolve()
    parts = list(source.parts)

    if INBOX_DIR_NAME not in parts:
        return None

    inbox_idx = parts.index(INBOX_DIR_NAME)
    parts[inbox_idx] = UNIVERSAL_DIR_NAME

    universal_dir = Path(*parts[:-1])
    target_path = universal_dir / skill_name

    if target_path.exists():
        print(f"Warning: Target already exists in universal: {target_path}")
        return None

    universal_dir.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(target_path))
    print(f"Moved to universal: {source} -> {target_path}")
    return target_path


def _generate_version_file(
    source: Path,
    target: Path,
    skill_name: str,
    symlink: bool,
    ignore_patterns: list[str],
    universal_source: Path | None = None,
) -> None:
    """Generate version.json file in target directory.

    Args:
        source: Original source directory path.
        target: Target directory path.
        skill_name: Name of the skill.
        symlink: Whether deployment is symlink mode.
        ignore_patterns: Patterns excluded from deployment.
        universal_source: New path if skill was moved from INBOX to universal.
    """
    actual_source = universal_source or source
    try:
        cwd = Path.cwd()
        source_rel = str(actual_source.resolve().relative_to(cwd))
    except ValueError:
        source_rel = str(actual_source)

    version_data = {
        "name": skill_name,
        "source_path": source_rel,
        "content_hash": _calculate_content_hash(actual_source, ignore_patterns)
        if not symlink
        else "",
        "deployed_at": datetime.now().isoformat(),
        "deploy_type": "symlink" if symlink else "copy",
    }

    version_file = target / "version.json"
    version_file.write_text(
        json.dumps(version_data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def deploy_skill(
    source: Path,
    dest: Path,
    symlink: bool = False,
    force: bool = False,
    name: str | None = None,
) -> bool:
    """Deploy skill from source to target directory.

    Args:
        source: Source directory containing SKILL.md.
        dest: Target installation directory.
        symlink: Create symlink instead of copying.
        force: Overwrite existing skill.
        name: Custom skill name.

    Returns:
        True if deployment succeeded.
    """
    if not source.exists():
        print(f"Error: Source directory does not exist: {source}")
        return False

    if not validate_skill_dir(source):
        print(
            f"Error: Source is not a valid skill directory (missing SKILL.md): {source}"
        )
        return False

    skill_name = name or source.name
    target = dest / skill_name

    dest.mkdir(parents=True, exist_ok=True)

    if target.exists():
        if force:
            if target.is_symlink() or target.is_dir():
                shutil.rmtree(target)
            else:
                target.unlink()
        else:
            print(f"Error: Skill already exists at {target}. Use --force to overwrite.")
            return False

    universal_source = None
    if _is_in_inbox(source):
        universal_source = _move_to_universal(source, skill_name)
        if universal_source:
            source = universal_source

    if symlink:
        target.symlink_to(source.resolve())
        print(f"Created symlink: {target} -> {source}")
        _generate_version_file(source, target, skill_name, True, [], universal_source)
    else:
        patterns = parse_skillignore(source)
        target.mkdir(exist_ok=True)
        copy_skill(source, target, patterns)
        _generate_version_file(
            source, target, skill_name, False, patterns, universal_source
        )
        print(f"Deployed skill to: {target}")
        if patterns:
            print(f"  Excluded {len(patterns)} pattern(s) from .skillignore")

    return True


def expand_path(path: str) -> Path:
    """Expand ~ and environment variables in path."""
    return Path(os.path.expandvars(os.path.expanduser(path)))


def main():
    parser = argparse.ArgumentParser(description="Deploy AI agent skills")
    parser.add_argument(
        "--source", "-s", required=True, help="Source directory containing the skill"
    )
    parser.add_argument(
        "--dest", "-d", required=True, help="Target installation directory"
    )
    parser.add_argument(
        "--symlink", "-l", action="store_true", help="Create symlink instead of copying"
    )
    parser.add_argument(
        "--force", "-f", action="store_true", help="Overwrite existing skill"
    )
    parser.add_argument("--name", "-n", help="Custom skill name")

    args = parser.parse_args()

    source = expand_path(args.source)
    dest = expand_path(args.dest)

    success = deploy_skill(source, dest, args.symlink, args.force, args.name)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
