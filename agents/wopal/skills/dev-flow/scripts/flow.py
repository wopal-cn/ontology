"""Flow CLI — Python entry point for dev-flow.

Phase 0 skeleton: only provides --help and version; all subcommands
will be dispatched here in later phases by switching the hybrid router.
"""

from __future__ import annotations

import argparse
import sys

from dev_flow import __version__
from dev_flow.commands.issue import register_issue_parser, cmd_issue


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="flow.py",
        description="Dev-flow CLI (Python implementation)",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )
    subparsers = parser.add_subparsers(dest="command")

    # Placeholder: will be populated by later phase commands
    _ = subparsers.add_parser("help", help="Show help")

    # Register issue subcommand
    register_issue_parser(subparsers)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "help" or args.command is None:
        parser.print_help()
        return 0

    # Dispatch issue subcommand
    if args.command == "issue":
        return cmd_issue(args)

    return 0


if __name__ == "__main__":
    sys.exit(main())
