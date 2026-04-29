"""Plan workflow state machine.

Defines valid Plan states and transition rules for dev-flow.

State model: planning → executing → verifying → done

Reference: lib/state-machine.sh (bash implementation)
"""

import re
from pathlib import Path

# Valid Plan states in order
PLAN_STATES = ["planning", "executing", "verifying", "done"]

# Valid state transitions (from_state -> to_state)
VALID_TRANSITIONS = {
    (None, "planning"),       # Initial state
    ("planning", "executing"), # approve --confirm
    ("executing", "verifying"), # complete
    ("verifying", "done"),    # verify --confirm
}

# Special wildcard: any state -> planning (reset)
# Note: same state transition is always allowed (no-op)


def is_valid_state(state: str) -> bool:
    """Check if state is a valid Plan status.

    Args:
        state: State name to validate

    Returns:
        True if state is in PLAN_STATES
    """
    return state in PLAN_STATES


def is_valid_transition(from_state: str | None, to_state: str) -> bool:
    """Check if state transition is valid.

    Args:
        from_state: Current state (None for initial)
        to_state: Target state

    Returns:
        True if transition is allowed
    """
    # Same state is always allowed (no-op)
    if from_state == to_state:
        return True

    # Any state can reset to planning
    if to_state == "planning":
        return True

    # Check valid forward transitions
    return (from_state, to_state) in VALID_TRANSITIONS


def get_next_state(command: str) -> str | None:
    """Get next state based on command.

    Args:
        command: Command name (e.g., "plan", "approve", "complete")

    Returns:
        Next state name, or None if command doesn't change state
    """
    # Command -> state mappings
    command_state_map = {
        "plan": "planning",
        "approve": "executing",
        "complete": "verifying",
        "verify": "done",
        "archive": None,  # Archive removes plan, no state transition
    }

    return command_state_map.get(command)


def parse_plan_status(plan_path: str) -> str | None:
    """Parse current status from Plan file.

    Reads the "- **Status**: <state>" line from Plan frontmatter.

    Args:
        plan_path: Path to Plan markdown file

    Returns:
        Current status string, or None if not found/invalid
    """
    path = Path(plan_path)
    if not path.exists():
        return None

    content = path.read_text()

    # Match status line in frontmatter
    # Format: "- **Status**: planning"
    match = re.search(r"^\- \*\*Status\*\*:\s*(\w+)", content, re.MULTILINE)

    if not match:
        return None

    status = match.group(1)

    # Validate status is a known state
    if is_valid_state(status):
        return status

    return None


def get_state_order(state: str) -> int:
    """Get order number for state (1-4).

    Args:
        state: State name

    Returns:
        Order number (1-4), or 0 if unknown state
    """
    try:
        return PLAN_STATES.index(state) + 1
    except ValueError:
        return 0


def get_status_display(state: str) -> dict:
    """Get display info for a status.

    Args:
        state: State name

    Returns:
        Dict with order, name, emoji for display
    """
    state_info = {
        "planning": {"order": 1, "name": "planning", "emoji": "📝"},
        "executing": {"order": 2, "name": "executing", "emoji": "🚀"},
        "verifying": {"order": 3, "name": "verifying", "emoji": "🔍"},
        "done": {"order": 4, "name": "done", "emoji": "📦"},
    }

    return state_info.get(state, {"order": 0, "name": "unknown", "emoji": "❓"})


def plan_status_to_issue_label(status: str) -> str | None:
    """Map Plan status to Issue label.

    Args:
        status: Plan status string

    Returns:
        Corresponding Issue label name, or None if unknown
    """
    label_map = {
        "planning": "status/planning",
        "executing": "status/in-progress",
        "verifying": "status/verifying",
        "done": None,  # Issue closed, no label needed
    }

    return label_map.get(status)