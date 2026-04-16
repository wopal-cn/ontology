#!/bin/bash
# git-fixture.sh - Git fixture creation utilities for dev-flow tests
#
# Usage: source this file to use fixture functions
#   source tests/lib/git-fixture.sh
#
# Provides:
#   - Temporary git workspace creation (bare remote + clone)
#   - Commit time line construction
#   - Test fixture cleanup
#
# Guard: GIT_FIXTURE_LOADED

# Prevent duplicate loading
if [[ -n "${GIT_FIXTURE_LOADED:-}" ]]; then
    return 0
fi
readonly GIT_FIXTURE_LOADED=1

# ============================================
# Fixture Directory Management
# ============================================

# Get test fixture directory (unique per test run)
# Creates: /tmp/dev-flow-test-<pid>/
# Usage: get_fixture_dir
get_fixture_dir() {
    if [[ -n "${FIXTURE_DIR:-}" ]]; then
        echo "$FIXTURE_DIR"
        return 0
    fi
    
    FIXTURE_DIR="/tmp/dev-flow-test-$$"
    mkdir -p "$FIXTURE_DIR"
    echo "$FIXTURE_DIR"
}

# Setup fresh fixture environment
# Usage: setup_fixture
setup_fixture() {
    local fixture_dir
    fixture_dir=$(get_fixture_dir)
    
    # Clean up any existing fixture
    if [[ -d "$fixture_dir" ]]; then
        rm -rf "$fixture_dir"
    fi
    mkdir -p "$fixture_dir"
    
    echo "$fixture_dir"
}

# Cleanup fixture environment
# Usage: cleanup_fixture
cleanup_fixture() {
    if [[ -n "${FIXTURE_DIR:-}" && -d "${FIXTURE_DIR:-}" ]]; then
        rm -rf "$FIXTURE_DIR"
    fi
}

# ============================================
# Git Workspace Fixture Creation
# ============================================

# Create bare remote repository
# Usage: create_bare_remote <remote_name> <fixture_dir>
# Returns: path to bare remote
create_bare_remote() {
    local remote_name="${1:-origin}"
    local fixture_dir="${2:-$(get_fixture_dir)}"
    
    local remote_path="$fixture_dir/$remote_name.git"
    
    git init --bare "$remote_path" >/dev/null 2>&1
    
    echo "$remote_path"
}

# Create clone workspace with initial commit
# Usage: create_clone_workspace <remote_path> <workspace_name> <fixture_dir>
# Returns: path to clone workspace
create_clone_workspace() {
    local remote_path="$1"
    local workspace_name="${2:-workspace}"
    local fixture_dir="${3:-$(get_fixture_dir)}"
    
    local workspace_path="$fixture_dir/$workspace_name"
    
    git clone "$remote_path" "$workspace_path" >/dev/null 2>&1
    
    # Configure git user for commits
    cd "$workspace_path"
    git config user.name "Test User" >/dev/null 2>&1
    git config user.email "test@example.com" >/dev/null 2>&1
    
    echo "$workspace_path"
}

# Initialize workspace with initial commit
# Usage: init_workspace_commit <workspace_path> [message]
init_workspace_commit() {
    local workspace_path="$1"
    local message="${2:-Initial commit}"
    
    cd "$workspace_path"
    
    # Create README and commit
    echo "# Test Workspace" > README.md
    git add README.md
    git commit -m "$message" >/dev/null 2>&1
    
    # Push to remote
    git push origin main >/dev/null 2>&1 || \
    git push origin master >/dev/null 2>&1 || true
}

# ============================================
# Commit Timeline Construction
# ============================================

# Create a commit with specific content
# Usage: create_commit <workspace_path> <file_path> <content> <message>
create_commit() {
    local workspace_path="$1"
    local file_path="$2"
    local content="$3"
    local message="$4"
    
    cd "$workspace_path"
    
    # Ensure directory exists
    local file_dir
    file_dir=$(dirname "$file_path")
    if [[ ! -d "$file_dir" ]]; then
        mkdir -p "$file_dir"
    fi
    
    # Write content and commit
    echo "$content" > "$file_path"
    git add "$file_path"
    git commit -m "$message" >/dev/null 2>&1
    
    # Return commit hash
    git rev-parse HEAD
}

# Create commit with timestamp
# Usage: create_commit_with_time <workspace_path> <file_path> <content> <message> <timestamp>
create_commit_with_time() {
    local workspace_path="$1"
    local file_path="$2"
    local content="$3"
    local message="$4"
    local timestamp="$5"
    
    cd "$workspace_path"
    
    local file_dir
    file_dir=$(dirname "$file_path")
    if [[ ! -d "$file_dir" ]]; then
        mkdir -p "$file_dir"
    fi
    
    echo "$content" > "$file_path"
    git add "$file_path"
    
    # Set commit date
    GIT_AUTHOR_DATE="$timestamp" GIT_COMMITTER_DATE="$timestamp" \
        git commit -m "$message" >/dev/null 2>&1
    
    git rev-parse HEAD
}

# Push commits to remote
# Usage: push_commits <workspace_path> [remote] [branch]
push_commits() {
    local workspace_path="$1"
    local remote="${2:-origin}"
    local branch="${3:-main}"
    
    cd "$workspace_path"
    git push "$remote" "$branch" >/dev/null 2>&1 || \
    git push "$remote" master >/dev/null 2>&1 || true
}

# Create feature branch
# Usage: create_branch <workspace_path> <branch_name> [base]
create_branch() {
    local workspace_path="$1"
    local branch_name="$2"
    local base="${3:-main}"
    
    cd "$workspace_path"
    git checkout -b "$branch_name" "$base" >/dev/null 2>&1 || \
    git checkout -b "$branch_name" master >/dev/null 2>&1 || true
}

# Get last commit hash for a file
# Usage: get_file_last_commit <workspace_path> <file_path>
get_file_last_commit() {
    local workspace_path="$1"
    local file_path="$2"
    
    cd "$workspace_path"
    git log -n 1 --format='%H' -- "$file_path" 2>/dev/null || echo ""
}

# Check if commit is in remote
# Usage: is_commit_in_remote <workspace_path> <commit> [remote] [branch]
is_commit_in_remote() {
    local workspace_path="$1"
    local commit="$2"
    local remote="${3:-origin}"
    local branch="${4:-main}"
    
    cd "$workspace_path"
    
    # Fetch first
    git fetch "$remote" >/dev/null 2>&1 || true
    
    # Check ancestry
    git merge-base --is-ancestor "$commit" "$remote/$branch" 2>/dev/null || \
    git merge-base --is-ancestor "$commit" "$remote/master" 2>/dev/null || return 1
}

# ============================================
# Plan File Fixture Helpers
# ============================================

# Create a minimal plan file fixture
# Usage: create_plan_fixture <fixture_dir> <plan_name> <content>
create_plan_fixture() {
    local fixture_dir="$1"
    local plan_name="$2"
    local content="$3"
    
    local plan_dir="$fixture_dir/docs/products/plans"
    mkdir -p "$plan_dir"
    
    local plan_file="$plan_dir/$plan_name.md"
    echo "$content" > "$plan_file"
    
    echo "$plan_file"
}

# Create test plan directory structure
# Usage: create_plan_dirs <fixture_dir>
create_plan_dirs() {
    local fixture_dir="$1"
    
    mkdir -p "$fixture_dir/docs/products/plans/done"
    mkdir -p "$fixture_dir/docs/products/ontology/plans"
}

# ============================================
# Stub gh CLI
# ============================================

# Create stub gh command that logs calls
# Usage: create_stub_gh <fixture_dir>
create_stub_gh() {
    local fixture_dir="${1:-$(get_fixture_dir)}"
    
    local bin_dir="$fixture_dir/bin"
    mkdir -p "$bin_dir"
    
    local gh_stub="$bin_dir/gh"
    local gh_log="$fixture_dir/gh-calls.log"
    
    # Create stub script
    cat > "$gh_stub" << 'GHSTUB'
#!/bin/bash
# Stub gh CLI - logs all calls to file

GH_LOG="$FIXTURE_DIR/gh-calls.log"

# Log the call
echo "=== gh call at $(date) ===" >> "$GH_LOG"
echo "Command: gh $*" >> "$GH_LOG"
echo "PWD: $(pwd)" >> "$GH_LOG"

# Handle common gh commands with mock responses
case "$1" in
    repo)
        case "$2" in
            view)
                echo "owner/test-repo"
                exit 0
                ;;
        esac
        ;;
    issue)
        case "$2" in
            view)
                echo '{"number": 123, "title": "Test Issue", "body": "Test body", "state": "open"}'
                exit 0
                ;;
            create)
                echo "https://github.com/owner/test-repo/issues/123"
                exit 0
                ;;
        esac
        ;;
    pr)
        case "$2" in
            create)
                echo "https://github.com/owner/test-repo/pull/456"
                exit 0
                ;;
            view)
                echo '{"number": 456, "title": "Test PR", "mergedAt": null}'
                exit 0
                ;;
            list)
                echo '[]'
                exit 0
                ;;
        esac
        ;;
    label)
        exit 0
        ;;
    *)
        # Default: return success
        exit 0
        ;;
esac

exit 0
GHSTUB
    
    chmod +x "$gh_stub"
    
    # Initialize log file
    touch "$gh_log"
    
    echo "$bin_dir"
}

# Get gh stub log content
# Usage: get_gh_stub_log <fixture_dir>
get_gh_stub_log() {
    local fixture_dir="${1:-$(get_fixture_dir)}"
    cat "$fixture_dir/gh-calls.log"
}

# Check if gh stub was called with specific command
# Usage: gh_stub_called_with <fixture_dir> <pattern>
gh_stub_called_with() {
    local fixture_dir="${1:-$(get_fixture_dir)}"
    local pattern="$2"
    
    grep -qE "$pattern" "$fixture_dir/gh-calls.log"
}

# Export marker
true