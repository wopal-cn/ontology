#!/bin/bash
# wopal-scan-wrapper.sh
# Wrapper script to adapt openclaw scan.sh for wopal-cli
#
# Usage: wopal-scan-wrapper.sh <inbox_path> <openclaw_dir> [timeout_seconds]
#
# Exit codes: 0=SECURE, 1=WARNINGS, 2=COMPROMISED, 3=ERROR

set -euo pipefail

INBOX_PATH="${1:-}"
OPENCLAW_DIR="${2:-}"
TIMEOUT_SECS="${3:-120}"

if [ -z "$INBOX_PATH" ] || [ -z "$OPENCLAW_DIR" ]; then
  echo "ERROR: Missing required arguments"
  echo "Usage: $0 <inbox_path> <openclaw_dir> [timeout_seconds]"
  exit 3
fi

if [ ! -d "$INBOX_PATH" ]; then
  echo "ERROR: INBOX path does not exist: $INBOX_PATH"
  exit 3
fi

if [ ! -d "$OPENCLAW_DIR" ]; then
  echo "ERROR: OpenClaw directory does not exist: $OPENCLAW_DIR"
  exit 3
fi

SCAN_SH="$OPENCLAW_DIR/scripts/scan.sh"
if [ ! -f "$SCAN_SH" ]; then
  echo "ERROR: scan.sh not found at: $SCAN_SH"
  exit 3
fi

TEMP_DIR=$(mktemp -d)
ADAPTED_SCAN="$TEMP_DIR/scan-adapted.sh"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

sed -e "s|^SKILLS_DIR=.*|SKILLS_DIR=\"$INBOX_PATH\"|" \
    -e "s|^OPENCLAW_DIR=.*|OPENCLAW_DIR=\"$OPENCLAW_DIR\"|" \
    "$SCAN_SH" > "$ADAPTED_SCAN"

chmod +x "$ADAPTED_SCAN"

cd "$INBOX_PATH"

if command -v timeout &>/dev/null; then
  timeout "$TIMEOUT_SECS" bash "$ADAPTED_SCAN" 2>&1
  exit_code=$?
elif command -v gtimeout &>/dev/null; then
  gtimeout "$TIMEOUT_SECS" bash "$ADAPTED_SCAN" 2>&1
  exit_code=$?
else
  bash "$ADAPTED_SCAN" 2>&1
  exit_code=$?
fi

if [ $exit_code -eq 124 ]; then
  echo ""
  echo "ERROR: Scan timed out after ${TIMEOUT_SECS} seconds"
  exit 3
fi

exit $exit_code
