"""Git operations wrapper for dev-flow.

Provides subprocess-based Git operations with clear error handling.
All functions work with an explicit repo_path to support multi-repo scenarios.
"""

import subprocess
from pathlib import Path


def is_repo_dirty(repo_path: str) -> bool:
    """Check if git repo has uncommitted changes.

    Args:
        repo_path: Path to git repository root

    Returns:
        True if repo has uncommitted changes (staged or unstaged)
        False if repo is clean or path is not a valid repo
    """
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=repo_path,
        capture_output=True,
        text=True,
    )
    # If there's any output, repo is dirty
    return bool(result.stdout.strip())


def get_current_branch(repo_path: str) -> str:
    """Get current branch name.

    Args:
        repo_path: Path to git repository root

    Returns:
        Branch name, or empty string if not on a branch (detached HEAD)
        or path is not a valid repo
    """
    result = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=repo_path,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def get_remote_url(repo_path: str) -> str:
    """Get remote URL for origin.

    Args:
        repo_path: Path to git repository root

    Returns:
        Remote URL string, or empty string if no origin configured
    """
    result = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        cwd=repo_path,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def commit_all(repo_path: str, message: str) -> bool:
    """Commit all changes with given message.

    Args:
        repo_path: Path to git repository root
        message: Commit message

    Returns:
        True if commit succeeded (or nothing to commit)
        False if commit failed
    """
    # Stage all changes
    subprocess.run(
        ["git", "add", "-A"],
        cwd=repo_path,
        capture_output=True,
    )

    # Commit
    result = subprocess.run(
        ["git", "commit", "-m", message],
        cwd=repo_path,
        capture_output=True,
        text=True,
    )

    # Git returns 1 if nothing to commit, which is acceptable
    # Return True for success (0) or nothing to commit
    return result.returncode == 0 or "nothing to commit" in result.stdout


def push(repo_path: str) -> bool:
    """Push current branch to remote.

    Args:
        repo_path: Path to git repository root

    Returns:
        True if push succeeded (or already up to date)
        False if push failed
    """
    branch = get_current_branch(repo_path)
    if not branch:
        return False  # Can't push detached HEAD

    result = subprocess.run(
        ["git", "push", "origin", branch],
        cwd=repo_path,
        capture_output=True,
        text=True,
    )

    return result.returncode == 0


def is_git_repo(path: str) -> bool:
    """Check if path is inside a git repository.

    Args:
        path: Any path to check

    Returns:
        True if path is inside a git repo
    """
    result = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=path,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0 and result.stdout.strip() == "true"


def get_repo_root(path: str) -> str:
    """Get repository root directory from any path inside it.

    Args:
        path: Any path inside a git repo

    Returns:
        Absolute path to repo root, or empty string if not in a repo
    """
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        cwd=path,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def is_commit_in_remote(repo_path: str, remote: str = "origin", branch: str = "main") -> bool:
    """Check if HEAD commit is already pushed to remote branch.

    Args:
        repo_path: Path to git repository root
        remote: Remote name (default: origin)
        branch: Branch name (default: main)

    Returns:
        True if HEAD is ancestor of remote/branch (already pushed)
        False if HEAD is not pushed yet or cannot determine
    """
    # Fetch remote first (silent)
    subprocess.run(
        ["git", "fetch", remote, branch],
        cwd=repo_path,
        capture_output=True,
    )

    # Check if HEAD is ancestor of remote/branch
    result = subprocess.run(
        ["git", "merge-base", "--is-ancestor", "HEAD", f"{remote}/{branch}"],
        cwd=repo_path,
        capture_output=True,
    )

    # returncode 0 = HEAD is ancestor (already pushed)
    return result.returncode == 0


def get_relative_path(file_path: str, base_path: str) -> str:
    """Get relative path from base_path to file_path.

    Args:
        file_path: Absolute file path
        base_path: Base directory path

    Returns:
        Relative path string
    """
    file = Path(file_path).resolve()
    base = Path(base_path).resolve()

    try:
        return str(file.relative_to(base))
    except ValueError:
        # file_path is not relative to base_path
        return str(file)