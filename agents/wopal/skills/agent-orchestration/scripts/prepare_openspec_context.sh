#!/usr/bin/env bash
# Prepare OpenSpec context for agent execution

set -e

CHANGE_NAME="${1:-}"
OUTPUT_FILE="${2:-openspec-context.md}"

if [ -z "$CHANGE_NAME" ]; then
    echo "Usage: $0 <change-name> [output-file]"
    echo "Example: $0 add-dark-mode"
    exit 1
fi

CHANGE_DIR="openspec/changes/$CHANGE_NAME"

if [ ! -d "$CHANGE_DIR" ]; then
    echo "Error: Change directory not found: $CHANGE_DIR"
    exit 1
fi

cat > "$OUTPUT_FILE" <<EOF
# OpenSpec Execution Context: $CHANGE_NAME

Generated: $(date '+%Y-%m-%d %H:%M:%S')

## Proposal

EOF

if [ -f "$CHANGE_DIR/proposal.md" ]; then
    cat "$CHANGE_DIR/proposal.md" >> "$OUTPUT_FILE"
else
    echo "⚠️  proposal.md not found" >> "$OUTPUT_FILE"
fi

cat >> "$OUTPUT_FILE" <<EOF

## Design

EOF

if [ -f "$CHANGE_DIR/design.md" ]; then
    cat "$CHANGE_DIR/design.md" >> "$OUTPUT_FILE"
else
    echo "⚠️  design.md not found" >> "$OUTPUT_FILE"
fi

cat >> "$OUTPUT_FILE" <<EOF

## Specifications

EOF

if [ -f "$CHANGE_DIR/specs.md" ]; then
    cat "$CHANGE_DIR/specs.md" >> "$OUTPUT_FILE"
else
    echo "⚠️  specs.md not found" >> "$OUTPUT_FILE"
fi

cat >> "$OUTPUT_FILE" <<EOF

## Tasks

EOF

if [ -f "$CHANGE_DIR/tasks.md" ]; then
    cat "$CHANGE_DIR/tasks.md" >> "$OUTPUT_FILE"
else
    echo "⚠️  tasks.md not found" >> "$OUTPUT_FILE"
fi

echo "✅ OpenSpec context prepared: $OUTPUT_FILE"
echo "   Source: $CHANGE_DIR"
