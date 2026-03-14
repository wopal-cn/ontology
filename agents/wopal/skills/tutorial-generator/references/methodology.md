# Tutorial Generation Methodology Reference

This reference document defines the standard for converting technical reference manuals into user tutorials.

## 1. Core Philosophy: "From Dictionary to Story"

- **Reference Manuals** are definitive: "What is X?"
- **Tutorials** are procedural: "How to solve Y with X?"
- **Task**: Do not just translate or simplify. **Refactor** the knowledge to build a learning path.

## 2. Standard Operating Procedure (SOP)

### Phase 1: Ingest & Deconstruct
1.  **Nouns (Concepts)**: Identify key entities (e.g., Project, Task, Rule).
2.  **Verbs (Actions)**: Identify what users do with them (e.g., Create, Deploy).
3.  **Pro Tips**: Mark "advanced but useful" features for the "Advanced" sections.

### Phase 2: Curriculum Design
Reorganize docs into a learning curve, NOT a feature list:
-   **Quickstart**: 10-min end-to-end task.
-   **Core Concepts**: The 20% features used 80% of the time.
-   **Advanced Usage**: Customization & Pro features.
-   **Practical Scenarios**: Real-world use cases.

### Phase 3: Authoring Template
Every tutorial chapter must follow this structure:

```markdown
# [Action-Oriented Title] (e.g., Deploying Your App)

> **导读**: Value proposition one-liner.
> **时间**: [XX] min
> **目标**: What will the user be able to do?

## The "Why" (Scenario)
Explain the use case in plain English.

## The "What" (Concepts)
Simple definitions using analogies.

## The "How" (Steps)
1. Step 1...
2. Step 2...
   [Code Block / Configuration]

## Best Practices (Critical!)
Don't just say *how* to do it, say how to do it *best*.
- Security tips
- Performance tips
- "Gotchas"

## Summary & Next Steps
```

## 3. The Golden Rules (Critical!)

### 1. Official Asset Priority
-   **Rule**: **Prefer Official Image Links over Screenshots.**
-   **Why**: Official docs usually have maintained, high-quality diagrams. reusing their URLs ensures visual consistency and zero maintenance.
-   **Action**: Only generate ASCII art or request screenshots if NO official image exists.

### 2. Depth Preservation (Avoid Over-Simplification)
-   **Rule**: **Do NOT delete advanced features just to be "simple".**
-   **Action**: Use `> [!TIP]` or `## Advanced` sections for complex features (e.g., Regex patterns, CLI flags). Novices skip them; pros need them.

### 3. Best Practices Integration
-   **Rule**: **Teach the "Right Way", not just the "Possible Way".**
-   **Action**: If a parameter accepts any string, but industry standard is "snake_case", explicity teach "snake_case".

### 4. Terminology Consistency
-   **Rule**: **No Inventions.**
-   **Action**: Use the official product glossary. 
