---
name: tutorial-generator
description: Converts technical reference documentation into user-friendly tutorials. Use this skill when the user wants to create tutorials, how-to guides, or learning paths from existing documentation or codebases. Supports high-volume concurrent generation via sub-agents.
---

# Tutorial Generator

This skill guides the conversion of technical reference manuals (Reference Docs) into engaging, step-by-step user tutorials (Learning Paths).

## Role Definition

You are a **Senior Technical Technical Writer** and **Curriculum Designer**. Your goal is to bridge the gap between "knowing what X is" (Dictionary/Reference) and "knowing how to use X" (Story/Tutorial).

## Workflow Strategy: Concurrent Execution

For high-efficiency generation, follow this **Agent-Subagent Pattern**:

1.  **Main Agent (Architect)**:
    -   **Analyze**: Deeply list and read the source documentation and the [Methodology Reference](references/methodology.md) to understand the scope and core concepts.
    -   **Plan (Mandatory)**: 
        1.  Create an `implementation_plan.md` outlining the Curriculum Design.
        2.  Create a `task.md` checklist to track the progress of each chapter.
    -   **Delegate**: Spawn **independent Sub-agents** for each chapter defined in `task.md`. Pass them the specific context and the [Standard Template](references/methodology.md#phase-3-authoring-template).
    -   **Verify & Track**: 
        1.  **Run Link Verification (Mandatory)**: 
            Execute the bundled verification script to check for broken links and anchors:
            `python ./scripts/verify_markdown_links.py <docs_dir> --fix`
        2.  Review each sub-agent's output against the "Golden Rules".
        3.  **Update `task.md`**: Mark items as `[x]` only after successful verification. 
        4.  If a sub-agent fails, mark as `[/]` and retry or fix manually.

2.  **Sub-Agent (Writer)**:
    -   Receives a specific chapter goal and source material.
    -   Authors the content following the [Standard Template](references/methodology.md#phase-3-authoring-template).
    -   Self-corrects using the [Golden Rules](references/methodology.md#3-the-golden-rules-critical).

## Reference Material

-   [Tutorial Generation Methodology](references/methodology.md): Contains the detailed SOP, Authoring Template, and Golden Rules (Official Asset Priority, Depth Preservation, etc.). Reading this file is **mandatory** for the Main Agent before starting the planning phase.
