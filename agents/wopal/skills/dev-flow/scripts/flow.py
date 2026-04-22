"""Flow CLI — Python entry point for dev-flow.

Phase 0 skeleton: only provides --help and version; all subcommands
will be dispatched here in later phases by switching the hybrid router.
"""

from __future__ import annotations

import argparse
import sys

from dev_flow import __version__
from dev_flow.commands.issue import register_issue_parser, cmd_issue
from dev_flow.commands.query import register_query_parser, cmd_query
from dev_flow.commands.sync import register_sync_parser, cmd_sync
from dev_flow.commands.archive import register_archive_parser, cmd_archive
from dev_flow.commands.complete import register_complete_parser, cmd_complete
from dev_flow.commands.verify import register_verify_parser, cmd_verify
from dev_flow.commands.plan import register_plan_parser, cmd_plan


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

    # Help subcommand with detailed output
    help_parser = subparsers.add_parser("help", help="Show help")

    # Register issue subcommand
    register_issue_parser(subparsers)

    # Register query subcommand
    register_query_parser(subparsers)

    # Register sync subcommand
    register_sync_parser(subparsers)

    # Register archive subcommand
    register_archive_parser(subparsers)

    # Register complete subcommand
    register_complete_parser(subparsers)

    # Register verify subcommand
    register_verify_parser(subparsers)

    # Register plan subcommand
    register_plan_parser(subparsers)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "help" or args.command is None:
        # Print detailed help with all subcommands and their nested commands
        parser.print_help()
        print()
        print("Available subcommands:")
        print("  issue create    Create a new GitHub Issue")
        print("  issue update    Update an existing GitHub Issue")
        print("  query status    Show Issue/Plan status")
        print("  query list      List active Plans")
        print("  sync            Sync Plan to Issue (body + labels)")
        print("  sync --body-only    Sync only Issue body")
        print("  sync --labels-only  Sync only Issue labels")
        print()
        print("Workflow commands (legacy):")
        print("  plan            Create or locate a Plan")
        print("  approve         Review and approve a Plan")
        print("  archive         Archive a completed Plan")
        print()
        print("Python-implemented workflow commands:")
        print("  complete        Mark implementation complete")
        print("  verify          Verify and confirm completion")
        return 0

    # Dispatch issue subcommand
    if args.command == "issue":
        return cmd_issue(args)

    # Dispatch query subcommand
    if args.command == "query":
        return cmd_query(args)

    # Dispatch sync subcommand
    if args.command == "sync":
        return cmd_sync(args)

    # Dispatch archive subcommand
    if args.command == "archive":
        return cmd_archive(args)

    # Dispatch complete subcommand
    if args.command == "complete":
        return cmd_complete(args)

    # Dispatch verify subcommand
    if args.command == "verify":
        return cmd_verify(args)

    # Dispatch plan subcommand
    if args.command == "plan":
        return cmd_plan(args)

    return 0


if __name__ == "__main__":
    sys.exit(main())