# lib/git.sh: Git 操作辅助函数
#
# 提供文件级 push 状态检测、commit 可达性判断等工具函数

# ============================================
# is_file_pushed: 判断文件最后一次修改的 commit 是否已进入远程分支
# ============================================
#
# 核心逻辑：
#   1. 定位最后一次修改该文件的 commit（git log -n 1 --format='%H' -- <file>）
#   2. 判断该 commit 是否已进入远程分支（git merge-base --is-ancestor）
#
# 用法：
#   is_file_pushed <file-path> [<remote-branch>]
#
# 参数：
#   file-path     - 文件路径（相对于 repo root）
#   remote-branch - 远程分支名（默认 origin/main）
#
# 返回：
#   0 (true)  - 文件最后修改的 commit 已在远程分支中
#   1 (false) - 文件最后修改的 commit 未进入远程分支
#   2 (error) - 文件未被 commit 或 git 命令失败
#
# 注意：
#   - 文件有未提交变更时返回 2（不是 1），区分"未 commit"和"commit 了但未 push"
#   - 只检测最后修改该文件的 commit，不关心仓库是否有其他 ahead commit
#
is_file_pushed() {
    local file_path="${1:-}"
    local remote_branch="${2:-origin/main}"
    local root_dir="${ROOT_DIR:-$(pwd)}"

    # 参数校验
    if [[ -z "$file_path" ]]; then
        return 2
    fi

    # 确保远程分支引用存在（fetch 后才有）
    if ! git -C "$root_dir" rev-parse --verify "$remote_branch" >/dev/null 2>&1; then
        # 尝试 fetch 以获取远程分支信息
        git -C "$root_dir" fetch --quiet >/dev/null 2>&1 || true
        # 再次检查
        if ! git -C "$root_dir" rev-parse --verify "$remote_branch" >/dev/null 2>&1; then
            return 2
        fi
    fi

    # 检查文件是否有未提交变更
    local file_status
    file_status=$(git -C "$root_dir" status --porcelain -- "$file_path" 2>/dev/null || echo "")
    if [[ -n "$file_status" ]]; then
        # 文件有未提交变更，返回特殊错误码
        return 2
    fi

    # 定位最后一次修改该文件的 commit
    local last_commit
    last_commit=$(git -C "$root_dir" log -n 1 --format='%H' -- "$file_path" 2>/dev/null || echo "")

    if [[ -z "$last_commit" ]]; then
        # 文件未被 commit（可能是新文件或从未 tracked）
        return 2
    fi

    # 判断该 commit 是否是远程分支的祖先
    if git -C "$root_dir" merge-base --is-ancestor "$last_commit" "$remote_branch" 2>/dev/null; then
        return 0  # 已 push
    else
        return 1  # 未 push
    fi
}

# ============================================
# get_file_last_commit: 获取文件最后一次修改的 commit hash
# ============================================
#
# 用法：
#   get_file_last_commit <file-path>
#
# 返回：
#   成功时输出 commit hash（stdout）
#   失败时输出空字符串
#
get_file_last_commit() {
    local file_path="${1:-}"
    local root_dir="${ROOT_DIR:-$(pwd)}"

    if [[ -z "$file_path" ]]; then
        echo ""
        return 1
    fi

    git -C "$root_dir" log -n 1 --format='%H' -- "$file_path" 2>/dev/null || echo ""
}

# ============================================
# get_repo_ahead_count: 获取当前 HEAD 领先远程分支的提交数（仓库级）
# ============================================
#
# 注意：这是仓库级检测，不适合判断特定文件的 push 状态
# 请用 is_file_pushed 判断文件级 push 状态
#
# 用法：
#   get_repo_ahead_count [<remote-branch>]
#
# 返回：
#   成功时输出数字（stdout）
#   失败时输出 0
#
get_repo_ahead_count() {
    local remote_branch="${1:-origin/main}"
    local root_dir="${ROOT_DIR:-$(pwd)}"

    git -C "$root_dir" rev-list --count "$remote_branch"..HEAD 2>/dev/null || echo "0"
}

# ============================================
# is_commit_in_remote: 判断指定 commit 是否已进入远程分支
# ============================================
#
# 用法：
#   is_commit_in_remote <commit-hash> [<remote-branch>]
#
# 返回：
#   0 (true)  - commit 已在远程分支中
#   1 (false) - commit 未进入远程分支
#   2 (error) - 参数缺失或 git 命令失败
#
is_commit_in_remote() {
    local commit="${1:-}"
    local remote_branch="${2:-origin/main}"
    local root_dir="${ROOT_DIR:-$(pwd)}"

    if [[ -z "$commit" ]]; then
        return 2
    fi

    # 确保远程分支引用存在
    if ! git -C "$root_dir" rev-parse --verify "$remote_branch" >/dev/null 2>&1; then
        git -C "$root_dir" fetch --quiet >/dev/null 2>&1 || true
        if ! git -C "$root_dir" rev-parse --verify "$remote_branch" >/dev/null 2>&1; then
            return 2
        fi
    fi

    # 判断 commit 是否是远程分支的祖先
    if git -C "$root_dir" merge-base --is-ancestor "$commit" "$remote_branch" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}