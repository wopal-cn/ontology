#!/usr/bin/env python3
# bootstrap.py - Unified test harness for scripts path injection
#
# Provides ensure_scripts_path() to inject dev-flow scripts directory
# into sys.path for both direct execution and unittest discover modes.

import sys
from pathlib import Path

# bootstrap.py is at: <skill-root>/tests/python/support/bootstrap.py
# scripts/ is at: <skill-root>/scripts (parents[3] from here)
_THIS_FILE = Path(__file__).resolve()
_SCRIPTS_DIR = str(_THIS_FILE.parents[3] / "scripts")


def ensure_scripts_path() -> str:
    """
    Inject scripts directory into sys.path for dev_flow imports.

    Returns:
        The scripts path string (idempotent - same value on repeated calls)
    """
    if _SCRIPTS_DIR not in sys.path:
        sys.path.insert(0, _SCRIPTS_DIR)
    return _SCRIPTS_DIR