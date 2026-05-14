# project.py - Project path resolution
#
# Unified project path resolution, replacing scattered _find_project_path
# copies in archive.py and approve.py.
#
# Resolution priority:
#   1. Project Path from Plan metadata (declared path)
#   2. Fallback: projects/<project_name> (backward compat)
#   3. Fallback: search workspace root children for directory matching
#      <project_name>, then walk up to find the git root

from enum import Enum
from pathlib import Path
import subprocess

from dev_flow.domain.plan.metadata import get_plan_field


class ProjectType(Enum):
    """Project type enumeration."""
    STANDARD = "standard"
    ONTOLOGY_WORKTREE = "ontology-worktree"


# Project type registry: maps project_name -> {type, path}
PROJECT_TYPE_REGISTRY = {
    "wopal-space-ontology": {
        "type": ProjectType.ONTOLOGY_WORKTREE,
        "path": ".wopal",
    },
    # Standard projects are not registered; they use default resolution
}


def resolve_project_path(
    plan_path: str,
    project_name: str,
    workspace_root: Path,
) -> Path | None:
    """Resolve project's git root directory path.

    Resolution order:
      1. Read `Target Project Path` from Plan metadata → find git root → return
      2. Fallback `projects/<project_name>` → return if it's a git repo
      3. Search workspace children for dir named `<project_name>`,
         walk up to git root → return

    Returns the directory containing .git (repo root or worktree root),
    not necessarily the project source directory.

    Args:
        plan_path: Path to Plan markdown file
        project_name: Project name from Plan metadata (for fallback)
        workspace_root: Workspace root path

    Returns:
        Absolute path to git root directory, or None
    """
    # Step 1: Plan-declared path
    declared = get_plan_field(plan_path, "Project Path")
    if declared:
        candidate = workspace_root / declared
        git_root = _find_git_root(candidate)
        if git_root:
            return git_root

    # Step 2: Backward compat fallback
    if project_name:
        candidate = workspace_root / "projects" / project_name
        git_root = _find_git_root(candidate)
        if git_root:
            return git_root

    # Step 3: Search workspace children for matching directory
    if project_name:
        for entry in workspace_root.iterdir():
            if entry.is_dir():
                candidate = entry / project_name
                git_root = _find_git_root(candidate)
                if git_root:
                    return git_root

    return None


def _find_git_root(path: Path) -> Path | None:
    """Find git root by checking path/.git, then parent/.git.

    Only checks the given path and its immediate parent, not
    walking up to filesystem root. Prevents accidentally matching
    a workspace-level .git when the project is not a git repo.
    """
    if not path.exists():
        return None
    if (path / ".git").exists():
        return path
    parent = path.parent
    if (parent / ".git").exists():
        return parent
    return None


def _is_git_repo(project_path: Path) -> bool:
    """Check if path is inside a git repository.

    Shortcut for _find_git_root() is not None.
    """
    return _find_git_root(project_path) is not None


def resolve_project_type(project_name: str) -> ProjectType:
    """Resolve project type from registry.

    Args:
        project_name: Project name from Plan metadata

    Returns:
        ProjectType enum value. Returns ProjectType.STANDARD for unregistered projects.
    """
    if project_name in PROJECT_TYPE_REGISTRY:
        return PROJECT_TYPE_REGISTRY[project_name]["type"]
    return ProjectType.STANDARD


def get_current_branch(repo_path: Path) -> str | None:
    """Get current branch name from git repository.

    Args:
        repo_path: Path to git repository (can be worktree root)

    Returns:
        Branch name (e.g., "space/main", "main"), or None if not on any branch
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            check=True,
        )
        branch = result.stdout.strip()
        return branch if branch and branch != "HEAD" else None
    except subprocess.CalledProcessError:
        return None


def get_ontology_main_repo(workspace_root: Path) -> Path | None:
    """Resolve ontology main repository path from .wopal/.git file.

    The .wopal/.git file is a worktree pointer with format:
        gitdir: /path/to/main/repo/.git/worktrees/-wopal

    Args:
        workspace_root: Workspace root path

    Returns:
        Path to ontology main repository, or None if not resolvable
    """
    dot_git_path = workspace_root / ".wopal" / ".git"

    if not dot_git_path.exists() or not dot_git_path.is_file():
        return None

    try:
        content = dot_git_path.read_text().strip()
        # Format: "gitdir: /path/to/.git/worktrees/-wopal"
        if content.startswith("gitdir: "):
            gitdir_path = content[len("gitdir: "):].strip()
            # Extract main repo: remove /.git/worktrees/-wopal suffix
            # gitdir: /Users/sam/.wopal/ontologies/wopal-space-ontology/.git/worktrees/-wopal
            # main repo: /Users/sam/.wopal/ontologies/wopal-space-ontology
            if "/.git/worktrees/" in gitdir_path:
                main_repo = gitdir_path.split("/.git/worktrees/")[0]
                return Path(main_repo)
    except Exception:
        return None

    return None