#!/bin/bash
# common.sh - Shared utilities for dev-flow
#
# Usage: source this file to use functions
#   source lib/common.sh
#
# Provides:
#   - Color output constants (RED, GREEN, YELLOW, BLUE, CYAN, NC)
#   - Logging functions (log_info, log_success, log_warn, log_error, log_step)
#   - Workspace root detection (find_workspace_root)
#
# Guard: DEV_FLOW_COMMON_LOADED

# Prevent duplicate loading
if [[ -n "${DEV_FLOW_COMMON_LOADED:-}" ]]; then
    return 0
fi
readonly DEV_FLOW_COMMON_LOADED=1

# ============================================
# Color Output Constants
# ============================================

readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# ============================================
# Logging Functions
# ============================================

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_step()    { echo -e "${CYAN}[STEP]${NC} $1"; }

# ============================================
# Workspace Root Detection
# ============================================

# Find workspace root directory
# Priority: .wopal -> .git -> current directory
# Usage: find_workspace_root [start_dir]
# Output: absolute path to workspace root
find_workspace_root() {
    local search_dir="${1:-$(pwd)}"
    
    # Cache result if already found
    if [[ -n "${DEV_FLOW_WORKSPACE_ROOT:-}" ]]; then
        echo "$DEV_FLOW_WORKSPACE_ROOT"
        return 0
    fi
    
    while [[ "$search_dir" != "/" ]]; do
        # Check for .wopal directory (WopalSpace specific)
        if [[ -d "$search_dir/.wopal" ]]; then
            DEV_FLOW_WORKSPACE_ROOT="$search_dir"
            echo "$DEV_FLOW_WORKSPACE_ROOT"
            return 0
        fi
        # Check if we're inside .wopal
        if [[ "$(basename "$search_dir")" == ".wopal" ]]; then
            DEV_FLOW_WORKSPACE_ROOT="$(dirname "$search_dir")"
            echo "$DEV_FLOW_WORKSPACE_ROOT"
            return 0
        fi
        search_dir="$(dirname "$search_dir")"
    done
    
    # Fallback to git root
    DEV_FLOW_WORKSPACE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
    echo "$DEV_FLOW_WORKSPACE_ROOT"
}

# ============================================
# Skill Directory Detection
# ============================================

# Get skill directory (where the skill is located)
# Usage: get_skill_dir
# Output: absolute path to skill directory
get_skill_dir() {
    if [[ -n "${DEV_FLOW_SKILL_DIR:-}" ]]; then
        echo "$DEV_FLOW_SKILL_DIR"
        return 0
    fi
    
    # Infer from script location if sourced from a script
    if [[ -n "${BASH_SOURCE[0]:-"${0}"}" ]]; then
        local source_file="${BASH_SOURCE[0]:-"${0}"}"
        local source_dir
        source_dir="$(cd "$(dirname "$source_file")" && pwd)"
        
        # If we're in lib/, go up one level
        if [[ "$(basename "$source_dir")" == "lib" ]]; then
            DEV_FLOW_SKILL_DIR="$(dirname "$source_dir")"
        else
            DEV_FLOW_SKILL_DIR="$source_dir"
        fi
        echo "$DEV_FLOW_SKILL_DIR"
        return 0
    fi
    
    echo "."
}

# Export for use in other scripts
true