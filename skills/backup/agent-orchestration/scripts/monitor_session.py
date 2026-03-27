#!/usr/bin/env python3
"""
Monitor agent session progress with filtering and formatting.

Usage:
    python monitor_session.py <session-id> [options]

Options:
    --limit N         Show last N lines (default: 50)
    --offset N        Skip first N lines
    --filter PATTERN  Filter lines matching pattern
    --json            Output as JSON
    --watch           Continuously monitor (refresh every 5s)

Requirements:
    - @wopal/process tool installed globally (npm link)
    - Log files in /tmp/agent_logs/
"""

import sys
import json
import subprocess
import time
import re
import os
from pathlib import Path
from typing import Optional


def get_session_log(
    session_id: str, limit: Optional[int] = None, offset: Optional[int] = None
) -> str:
    """Fetch session log using process-adapter."""
    # Try process-adapter first
    cmd = ["process-adapter", "log", session_id]

    if limit:
        cmd.append(str(limit))
    if offset:
        cmd.append(str(offset))

    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            return result.stdout
    except FileNotFoundError:
        pass

    # Fallback to direct log file reading
    log_file = f"/tmp/agent_logs/{session_id}.log"
    if os.path.exists(log_file):
        with open(log_file, "r") as f:
            lines = f.readlines()
            if offset:
                lines = lines[offset:]
            if limit:
                lines = lines[-limit:]
            return "".join(lines)

    raise RuntimeError(f"Session not found: {session_id}")


def filter_log(log: str, pattern: Optional[str]) -> str:
    """Filter log lines matching pattern."""
    if not pattern:
        return log

    lines = log.split("\n")
    regex = re.compile(pattern, re.IGNORECASE)
    filtered = [line for line in lines if regex.search(line)]
    return "\n".join(filtered)


def format_as_json(log: str, session_id: str) -> str:
    """Format log as JSON."""
    lines = log.split("\n")
    data = {"session_id": session_id, "line_count": len(lines), "lines": lines}
    return json.dumps(data, indent=2)


def watch_session(
    session_id: str, limit: int = 50, filter_pattern: Optional[str] = None
):
    """Continuously monitor session."""
    print(f"Watching session {session_id} (Ctrl+C to stop)...\n")

    try:
        offset = 0
        while True:
            log = get_session_log(session_id, limit=limit, offset=offset)

            if filter_pattern:
                log = filter_log(log, filter_pattern)

            if log.strip():
                print(log)
                offset += limit

            time.sleep(5)
    except KeyboardInterrupt:
        print("\n\nMonitoring stopped.")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    session_id = sys.argv[1]
    limit = 50
    offset = None
    filter_pattern = None
    output_json = False
    watch_mode = False

    i = 2
    while i < len(sys.argv):
        arg = sys.argv[i]

        if arg == "--limit" and i + 1 < len(sys.argv):
            limit = int(sys.argv[i + 1])
            i += 2
        elif arg == "--offset" and i + 1 < len(sys.argv):
            offset = int(sys.argv[i + 1])
            i += 2
        elif arg == "--filter" and i + 1 < len(sys.argv):
            filter_pattern = sys.argv[i + 1]
            i += 2
        elif arg == "--json":
            output_json = True
            i += 1
        elif arg == "--watch":
            watch_mode = True
            i += 1
        else:
            print(f"Unknown option: {arg}")
            sys.exit(1)

    try:
        if watch_mode:
            watch_session(session_id, limit, filter_pattern)
        else:
            log = get_session_log(session_id, limit, offset)

            if filter_pattern:
                log = filter_log(log, filter_pattern)

            if output_json:
                print(format_as_json(log, session_id))
            else:
                print(log)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
