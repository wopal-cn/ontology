# COVERAGE.md — Bash → Python Test Coverage Matrix

> Task 0-4 deliverable for Issue #121.
> Maps every existing Bash test case to its Python migration target.
> Generated: 2026-04-22

## Legend

| Column | Meaning |
|--------|---------|
| **ID** | Unique case identifier (`U` = unit, `I` = integration) |
| **Bash Test** | Source file + scenario name |
| **Test Target** | What behavior is verified |
| **Python Slice** | Target `unittest` file that must cover this behavior |
| **Migration Phase** | Plan phase where the Python test is written |
| **Legacy-Only** | `yes` = behavior is Bash-internal plumbing; Python reimplementation handles it differently, no 1:1 test needed |
| **Status** | `pending` / `red` / `green` |

---

## Unit Tests (source: `tests/unit/`)

### test-issue-title.sh — `lib/issue.sh` :: `extract_scope`, `validate_issue_title`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| U4-1 | extract_scope: title with scope → returns scope | `extract_scope("feat(cli): add skills remove")` → `"cli"` | `tests/python/unit/test_issue_title.py` | 1 (Task 1-1) | no | pending |
| U4-2 | extract_scope: dev-flow scope | `extract_scope("fix(dev-flow): repair workflow bugs")` → `"dev-flow"` | `tests/python/unit/test_issue_title.py` | 1 (Task 1-1) | no | pending |
| U4-3 | extract_scope: no scope → empty | `extract_scope("refactor: unify plan status management")` → `""` | `tests/python/unit/test_issue_title.py` | 1 (Task 1-1) | no | pending |
| U4-4 | extract_scope: hyphenated scope | `extract_scope("feat(wopal-plugin): add new feature")` → `"wopal-plugin"` | `tests/python/unit/test_issue_title.py` | 1 (Task 1-1) | no | pending |
| U4-5 | validate: valid feat+scope passes | `validate_issue_title("feat(cli): add skills remove")` → exit 0 | `tests/python/unit/test_issue_title.py` | 1 (Task 1-1) | no | pending |
| U4-6 | validate: missing scope fails | `validate_issue_title("refactor: unify plan status management")` → exit 1 + mentions scope | `tests/python/unit/test_issue_title.py` | 1 (Task 1-1) | no | pending |
| U4-7 | validate: description >50 chars fails | `validate_issue_title("feat(cli): this is a very long description…")` → exit 1 + mentions length | `tests/python/unit/test_issue_title.py` | 1 (Task 1-1) | no | pending |
| U4-8 | validate: invalid type fails | `validate_issue_title("invalid(cli): some description")` → exit 1 + mentions type | `tests/python/unit/test_issue_title.py` | 1 (Task 1-1) | no | pending |
| U4-9 | validate: fix, enhance, perf types pass | Multiple valid type checks | `tests/python/unit/test_issue_title.py` | 1 (Task 1-1) | no | pending |

**Python module**: `scripts/dev_flow/domain/issue/title.py`
**Functions**: `extract_scope(title) -> str`, `validate_issue_title(title) -> None | raises`

---

### test-plan-naming.sh — `lib/plan.sh` :: `validate_plan_name`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| U5-1 | Issue format with scope passes | `validate_plan_name("110-feature-dev-flow-improve-plan-naming")` → exit 0 | `tests/python/unit/test_plan_naming.py` | 1 (Task 1-1) | no | pending |
| U5-2 | Issue format with cli scope | `validate_plan_name("42-feature-cli-add-skills-remove")` → exit 0 | `tests/python/unit/test_plan_naming.py` | 1 (Task 1-1) | no | pending |
| U5-3 | No-issue format with scope | `validate_plan_name("fix-dev-flow-handle-expired-tokens")` → exit 0 | `tests/python/unit/test_plan_naming.py` | 1 (Task 1-1) | no | pending |
| U5-4 | Hyphenated scope | `validate_plan_name("refactor-wopal-plugin-optimize-modules")` → exit 0 | `tests/python/unit/test_plan_naming.py` | 1 (Task 1-1) | no | pending |
| U5-5 | Old format multi-segment matches (regex limit) | `validate_plan_name("110-feature-improve-plan-naming")` → exit 0 (scope enforcement at creation) | `tests/python/unit/test_plan_naming.py` | 1 (Task 1-1) | no | pending |
| U5-6 | Single segment after type fails | `validate_plan_name("feature-someslug")` → exit 1 | `tests/python/unit/test_plan_naming.py` | 1 (Task 1-1) | no | pending |
| U5-7 | Old no-issue multi-segment matches | `validate_plan_name("fix-handle-expired-tokens")` → exit 0 | `tests/python/unit/test_plan_naming.py` | 1 (Task 1-1) | no | pending |
| U5-8 | Invalid type fails | `validate_plan_name("42-invalid-dev-flow-some-slug")` → exit 1 | `tests/python/unit/test_plan_naming.py` | 1 (Task 1-1) | no | pending |
| U5-9 | Valid fix, refactor, docs, chore types | Multiple valid type checks | `tests/python/unit/test_plan_naming.py` | 1 (Task 1-1) | no | pending |

**Python module**: `scripts/dev_flow/domain/plan/naming.py`
**Functions**: `validate_plan_name(name) -> None | raises`

---

### test-type-labels.sh — `lib/labels.sh` :: `normalize_plan_type`, `plan_type_to_issue_label`, `issue_label_to_plan_type`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| U6-1 | normalize perf → perf | `normalize_plan_type("perf")` → `"perf"` | `tests/python/unit/test_type_labels.py` | 1 (Task 1-1) | no | pending |
| U6-2 | perf → label type/perf | `plan_type_to_issue_label("perf")` → `"type/perf"` | `tests/python/unit/test_type_labels.py` | 1 (Task 1-1) | no | pending |
| U6-3 | label type/perf → perf | `issue_label_to_plan_type("type/perf")` → `"perf"` | `tests/python/unit/test_type_labels.py` | 1 (Task 1-1) | no | pending |
| U6-4 | test → label type/test | `plan_type_to_issue_label("test")` → `"type/test"` | `tests/python/unit/test_type_labels.py` | 1 (Task 1-1) | no | pending |

**Python module**: `scripts/dev_flow/domain/labels.py`
**Functions**: `normalize_plan_type(t)`, `plan_type_to_issue_label(t)`, `issue_label_to_plan_type(label)`

---

### test-check-doc.sh — `lib/check-doc.sh` :: `check_doc_plan`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| U2-1 | Valid issue plan passes | Plan with correct structure → pass | `tests/python/unit/test_check_doc.py` | 2 (Task 2-1) | no | pending |
| U2-2 | Valid no-issue plan passes | No-issue plan with correct structure → pass | `tests/python/unit/test_check_doc.py` | 2 (Task 2-1) | no | pending |
| U2-3 | Numbered list Changes rejected | Plan using `1.` `2.` instead of `- [ ] Step` → reject | `tests/python/unit/test_check_doc.py` | 2 (Task 2-1) | no | pending |
| U2-4 | Empty Test Plan rejected | Plan with empty/hollow Test Plan section → reject | `tests/python/unit/test_check_doc.py` | 2 (Task 2-1) | no | pending |
| U2-5 | No User Validation section → pass with warning (backward compat) | Missing section doesn't block, but warns | `tests/python/unit/test_check_doc.py` | 2 (Task 2-1) | no | pending |
| U2-6 | Good User Validation checked passes | Checked checkbox → pass | `tests/python/unit/test_check_doc.py` | 2 (Task 2-1) | no | pending |
| U2-7 | Old plan without TechContext passes (backward compat) | Legacy format without TechContext section → pass | `tests/python/unit/test_check_doc.py` | 2 (Task 2-1) | no | pending |

**Python module**: `scripts/dev_flow/domain/validation.py`
**Functions**: `check_doc_plan(plan_path) -> list[str]` (returns warnings; raises on errors)

**Fixtures required**: `tests/fixtures/plans/*.md` (migrate to Python temp files or keep as shared fixtures)

---

### test-user-validation.sh — `lib/plan.sh` :: `check_user_validation`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| U3-1 | Plain text (no checkbox) → fail | User Validation section exists but no checkbox line → block | `tests/python/unit/test_user_validation.py` | 2 (Task 2-1) | no | pending |
| U3-2 | Checkbox unchecked → fail | `- [ ] 用户已完成` → block | `tests/python/unit/test_user_validation.py` | 2 (Task 2-1) | no | pending |
| U3-3 | Checkbox checked → pass | `- [x] 用户已完成` → pass | `tests/python/unit/test_user_validation.py` | 2 (Task 2-1) | no | pending |
| U3-4 | No User Validation section → pass (backward compat) | Old plans without section → pass | `tests/python/unit/test_user_validation.py` | 2 (Task 2-1) | no | pending |

**Python module**: `scripts/dev_flow/domain/validation.py`
**Functions**: `check_user_validation(plan_path) -> None | raises`

---

### test-approve-push.sh — `lib/git.sh` :: `is_file_pushed`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| U1-1 | Plan pushed + unrelated ahead → pass | `is_file_pushed(plan_path, remote_ref)` returns 0 when plan commit is ancestor of remote | `tests/python/unit/test_git_is_file_pushed.py` | 2 (Task 2-1) | no | pending |
| U1-2 | Plan committed but not pushed → fail (exit 1) | Local-only commit returns 1 | `tests/python/unit/test_git_is_file_pushed.py` | 2 (Task 2-1) | no | pending |
| U1-3 | Plan not committed (untracked) → fail (exit 2) | Untracked file returns 2 | `tests/python/unit/test_git_is_file_pushed.py` | 2 (Task 2-1) | no | pending |

**Python module**: `scripts/dev_flow/infra/git.py`
**Functions**: `is_file_pushed(plan_rel_path, remote_ref) -> int` (0/1/2)

**Note**: This is the only test that directly sources `lib/git.sh`. Python equivalent will use `subprocess` to call `git log` / `git merge-base`.

---

### test-plan-link-contract.sh — `lib/plan-sync.sh`, `lib/issue.sh`, `lib/plan.sh` :: `build_repo_blob_url`, `build_issue_body_from_plan`, `find_plan_by_issue`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| U7-1 | build_repo_blob_url creates GitHub blob links | `"sampx/wopal-space"` + path → full blob URL | `tests/python/unit/test_plan_link_contract.py` | 2 (Task 2-1) | no | pending |
| U7-2 | build_issue_body_from_plan embeds blob URL | Issue body contains blob URL for plan link | `tests/python/unit/test_plan_link_contract.py` | 2 (Task 2-1) | no | pending |
| U7-3 | find_plan_by_issue resolves archived plans in done/ | Issue #120 → finds `done/YYYYMMDD-120-…md` | `tests/python/unit/test_plan_link_contract.py` | 2 (Task 2-1) | no | pending |

**Python modules**: `scripts/dev_flow/domain/issue/link.py`, `scripts/dev_flow/domain/plan/find.py`
**Functions**: `build_repo_blob_url(repo, path)`, `build_issue_body_from_plan(…)`, `find_plan_by_issue(issue_num)`

**Note**: This test sources 5 Bash libs + `flow.sh`. Python equivalent will be a pure unit test mocking only `find_workspace_root`.

---

## Integration Tests (source: `tests/integration/`)

### test-command-surface.sh — `scripts/flow.sh help`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| I1 | help exposes issue create/update | `flow.sh help` output contains `issue create` and `issue update` | `tests/python/integration/test_command_surface.py` | 3 (Task 3-1) | no | pending |
| I2 | help no longer exposes new-issue | `flow.sh help` output does NOT contain `new-issue` | `tests/python/integration/test_command_surface.py` | 3 (Task 3-1) | no | pending |

**Test mode**: `FLOW_BIN` parameterized — run against both `flow-legacy.sh` and `flow.sh`

---

### test-issue-contract.sh — `lib/issue.sh` :: `build_structured_issue_body`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| I3-1 | Fix type has audit sections | Confirmed Bugs, Content Model Defects, Cleanup Scope, Key Findings present | `tests/python/integration/test_issue_contract.py` | 2 (Task 2-1) | no | pending |
| I3-2 | Non-fix type has no audit sections | Feature body lacks Confirmed Bugs, Content Model Defects | `tests/python/integration/test_issue_contract.py` | 2 (Task 2-1) | no | pending |
| I3-3 | Section order is consistent | Goal < Background < Confirmed Bugs < Content Model Defects < Key Findings < In Scope | `tests/python/integration/test_issue_contract.py` | 2 (Task 2-1) | no | pending |
| I3-4 | Perf/Refactor/Docs/Test dedicated sections | Perf→Baseline, Refactor→Affected Components, Docs→Target Documents, Test→Test Strategy | `tests/python/integration/test_issue_contract.py` | 2 (Task 2-1) | no | pending |
| I3-5 | Empty optional sections suppressed | Minimal body omits Background, In Scope | `tests/python/integration/test_issue_contract.py` | 2 (Task 2-1) | no | pending |
| I3-6 | Template skeleton consistency | `templates/issue.md` sections match renderer output | `tests/python/integration/test_issue_contract.py` | 2 (Task 2-1) | no | pending |

**Python module**: `scripts/dev_flow/domain/issue/body.py`
**Functions**: `build_structured_issue_body(**kwargs) -> str`

---

### test-issue-create-command.sh — `scripts/flow.sh issue create`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| I4-1 | issue create infers perf type | `--title "perf(dev-flow): …"` → gh called with `type/perf` label + Baseline/Target sections | `tests/python/integration/test_issue_create_command.py` | 3 (Task 3-1) | no | pending |
| I4-2 | issue create rejects type mismatch | `--title "perf(…)" --type feature` → exit 1 + "Type mismatch" | `tests/python/integration/test_issue_create_command.py` | 3 (Task 3-1) | no | pending |

**Test mode**: `FLOW_BIN` parameterized; uses fake `gh` stub capturing `issue create` args to file.

---

### test-issue-update-command.sh — `scripts/flow.sh issue update`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| I5-1 | issue update preserves sections + syncs labels | Update title to perf → body keeps old sections; labels change: remove `type/feature` add `type/perf`, change project | `tests/python/integration/test_issue_update_command.py` | 3 (Task 3-1) | no | pending |

**Test mode**: `FLOW_BIN` parameterized; uses stateful fake `gh` with `GH_STATE_DIR`.

---

### test-issue-update.sh — `lib/issue.sh` :: `update_structured_issue_body`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| I6-1 | Update only target section | `--goal "New goal"` → goal changes, background/baseline remain | `tests/python/integration/test_issue_contract.py` (or dedicated `test_issue_update.py`) | 2 (Task 2-1) | no | pending |
| I6-2 | Preserve Related Resources rows | `--scope "alpha,beta"` → research row stays, Plan row stays, new scope items added | `tests/python/integration/test_issue_contract.py` | 2 (Task 2-1) | no | pending |
| I6-3 | Add research without touching Plan row | `--reference "docs/new.md"` on minimal body → research row inserted, Plan row present | `tests/python/integration/test_issue_contract.py` | 2 (Task 2-1) | no | pending |

**Python module**: `scripts/dev_flow/domain/issue/body.py`
**Functions**: `update_structured_issue_body(original_body, **kwargs) -> str`

---

### test-approve-confirm-clean.sh — `scripts/flow.sh approve --confirm`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| I7-1 | approve --confirm enters executing state | Plan status changes from `planning` to `executing` | `tests/python/integration/test_approve_confirm_clean.py` | 4 (Task 4-2) | no | pending |
| I7-2 | Plan file has executing status | File contains `- **Status**: executing` | `tests/python/integration/test_approve_confirm_clean.py` | 4 (Task 4-2) | no | pending |
| I7-3 | Workspace stays clean | `git status --porcelain` is empty after command | `tests/python/integration/test_approve_confirm_clean.py` | 4 (Task 4-2) | no | pending |
| I7-4 | Latest commit pushed to remote | HEAD is ancestor of `origin/main` | `tests/python/integration/test_approve_confirm_clean.py` | 4 (Task 4-2) | no | pending |
| I7-5 | Commit message is correct | Latest commit message = `docs(plan): approve plan #120` | `tests/python/integration/test_approve_confirm_clean.py` | 4 (Task 4-2) | no | pending |
| I7-6 | Issue synced after commit/push | `gh issue edit 120` appears in stub log | `tests/python/integration/test_approve_confirm_clean.py` | 4 (Task 4-2) | no | pending |

**Test mode**: Full git fixture (bare remote + clone + push); stub `gh`. Python equivalent uses `tempfile` + `subprocess` git or `tests/python/support/git_fixture.py`.

---

### test-verify-gate.sh — `lib/plan.sh` :: `check_user_validation` (verify context)

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| I8-1 | Unchecked checkbox blocks verify | Same function as U3-2 but in verifying workflow context | `tests/python/unit/test_user_validation.py` | 2 (Task 2-1) | no | pending |
| I8-2 | Checked checkbox allows verify | Same function as U3-3 but in verifying workflow context | `tests/python/unit/test_user_validation.py` | 2 (Task 2-1) | no | pending |
| I8-3 | Missing User Validation section in verifying → pass or block | Either behavior accepted (implementation-defined) | `tests/python/unit/test_user_validation.py` | 2 (Task 2-1) | no | pending |
| I8-4 | Wrong checkbox pattern blocks | Non-matching checkbox text like `验证完成` instead of `用户已完成` → block | `tests/python/unit/test_user_validation.py` | 2 (Task 2-1) | no | pending |

**Note**: I8-1/2/3 reuses the same `check_user_validation` function tested in U3-1/2/4. Python tests should cover both plan-creation and verifying-state contexts in one test file. I8-4 (wrong pattern) is unique to verify-gate.

---

### test-no-issue-pr.sh — `lib/issue.sh` :: `create_pr_for_plan`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| I9-1 | No-issue PR creation calls gh pr create | Stub gh receives `pr create` call | `tests/python/integration/test_command_surface.py` | 3 (Task 3-1) | no | pending |
| I9-2 | PR has repo parameter | `--repo` present in stub log | `tests/python/integration/test_command_surface.py` | 3 (Task 3-1) | no | pending |
| I9-3 | PR has base parameter | `--base` present in stub log | `tests/python/integration/test_command_surface.py` | 3 (Task 3-1) | no | pending |
| I9-4 | PR has title parameter | `--title` present in stub log | `tests/python/integration/test_command_surface.py` | 3 (Task 3-1) | no | pending |
| I9-5 | PR has body parameter | `--body` present in stub log | `tests/python/integration/test_command_surface.py` | 3 (Task 3-1) | no | pending |
| I9-6 | No undefined function error | Function exists and completes without bash error | `tests/python/integration/test_command_surface.py` | 3 (Task 3-1) | yes | pending |

**Python module**: `scripts/dev_flow/commands/issue.py` (or `complete.py` for PR creation)
**Note**: I9-6 is a Bash-specific check ("function not defined"). Python equivalent is ensured by module import.

---

### test-archive-plan-link.sh — `lib/plan-sync.sh` :: `update_issue_plan_link`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| I10-1 | update_issue_plan_link rewrites archived URL | Old blob URL → new `done/YYYYMMDD-…` blob URL in Issue body edit | `tests/python/integration/test_archive_plan_link.py` | 2 (Task 2-1) | no | pending |

**Python module**: `scripts/dev_flow/domain/issue/link.py`, `scripts/dev_flow/domain/plan/sync.py`
**Functions**: `update_issue_plan_link(issue_num, archived_path, repo)`

---

### test-related-resources-links.sh — `lib/issue.sh` :: `update_issue_link`

| ID | Scenario | Test Target | Python Slice | Phase | Legacy-Only | Status |
|----|----------|-------------|--------------|-------|-------------|--------|
| I11-1 | update_issue_link updates Related Resources row | Replaces `Plan | _待关联_` with actual link in Issue body edit | `tests/python/integration/test_related_resources_links.py` | 2 (Task 2-1) | no | pending |

**Python module**: `scripts/dev_flow/domain/issue/link.py`
**Functions**: `update_issue_link(issue_num, repo, resource_key, link_markdown)`

---

## Summary: Phase → Test File Mapping

| Phase | Python Test File | Bash Sources Covered | Case Count |
|-------|-----------------|---------------------|------------|
| **1** (Task 1-1) | `tests/python/unit/test_issue_title.py` | `test-issue-title.sh` | 9 |
| **1** (Task 1-1) | `tests/python/unit/test_plan_naming.py` | `test-plan-naming.sh` | 9 |
| **1** (Task 1-1) | `tests/python/unit/test_type_labels.py` | `test-type-labels.sh` | 4 |
| **2** (Task 2-1) | `tests/python/unit/test_check_doc.py` | `test-check-doc.sh` | 7 |
| **2** (Task 2-1) | `tests/python/unit/test_user_validation.py` | `test-user-validation.sh` + `test-verify-gate.sh` (U3+I8) | 8 |
| **2** (Task 2-1) | `tests/python/unit/test_git_is_file_pushed.py` | `test-approve-push.sh` | 3 |
| **2** (Task 2-1) | `tests/python/unit/test_plan_link_contract.py` | `test-plan-link-contract.sh` | 3 |
| **2** (Task 2-1) | `tests/python/integration/test_issue_contract.py` | `test-issue-contract.sh` + `test-issue-update.sh` | 9 |
| **2** (Task 2-1) | `tests/python/integration/test_archive_plan_link.py` | `test-archive-plan-link.sh` | 1 |
| **2** (Task 2-1) | `tests/python/integration/test_related_resources_links.py` | `test-related-resources-links.sh` | 1 |
| **3** (Task 3-1) | `tests/python/integration/test_command_surface.py` | `test-command-surface.sh` + `test-no-issue-pr.sh` | 8 |
| **3** (Task 3-1) | `tests/python/integration/test_issue_create_command.py` | `test-issue-create-command.sh` | 2 |
| **3** (Task 3-1) | `tests/python/integration/test_issue_update_command.py` | `test-issue-update-command.sh` | 1 |
| **4** (Task 4-2) | `tests/python/integration/test_approve_confirm_clean.py` | `test-approve-confirm-clean.sh` | 6 |
| **4** (Task 4-1) | `tests/python/integration/test_archive_project_repo_gate.py` | **New** (no Bash precedent) | 0 |
| **Total** | **15 Python test files** | **17 Bash test files** | **82** |

## Legacy-Only Behaviors

These Bash test aspects are internal plumbing that don't need 1:1 Python test migration:

| ID | Aspect | Reason |
|----|--------|--------|
| I9-6 | `create_pr_for_plan` function existence check | Python module import guarantees function exists; no bash "undefined function" analog |
| — | `source` chain order (test-plan-link-contract.sh sourcing 5 libs) | Python imports handle dependency resolution differently |

## Infrastructure Mapping

| Bash Infra | Python Equivalent | Notes |
|------------|-------------------|-------|
| `tests/lib/test-helpers.sh` (assertions) | `unittest.TestCase` methods + `tests/python/support/assertions.py` | stdlib `unittest` replaces custom assertions |
| `tests/lib/git-fixture.sh` (git fixtures) | `tests/python/support/git_fixture.py` | Wrap `subprocess` git calls; same fixture pattern |
| `tests/run-tests.sh` (runner) | `python3 -m unittest discover tests/python` | stdlib runner; no custom discovery needed |
| `tests/fixtures/plans/*.md` | Shared fixtures under `tests/python/fixtures/` or generated via `tempfile` | Keep shared; generate per-test via helper |
| `create_fake_gh` / `create_stub_gh` | `unittest.mock.patch('subprocess.run')` or `tests/python/support/gh_stub.py` | Mock at subprocess boundary or provide script stub |

## Risks / Ambiguities

1. **test-verify-gate.sh (I8-3) acceptance ambiguity**: The Bash test accepts *either* pass or block for "no User Validation section in verifying state." The Python test must choose one behavior and lock it down. Recommend: block for verifying state (strict gate), document the decision.

2. **test-no-issue-pr.sh fixture complexity**: Creates bare remote, clone, feature branch, push — all for a PR creation test. Python equivalent can simplify by mocking `subprocess.run` for `gh pr create` directly, eliminating git fixture overhead. But this changes the integration boundary.

3. **test-approve-confirm-clean.sh full git lifecycle**: This test exercises commit → push → issue sync in one flow. Python equivalent needs the same git fixture infrastructure (`git_fixture.py`). This is the most complex integration test to migrate.

4. **Shared fixtures between Bash and Python**: `tests/fixtures/plans/*.md` are used by both `test-check-doc.sh` and `test-user-validation.sh`. Python tests can reference the same files (they're language-agnostic markdown), but the path resolution differs (`SKILL_DIR` vs Python import paths).

5. **`FLOW_BIN` parameterization not needed for Phase 1-2**: Pure domain logic tests (title, naming, labels, check-doc, user-validation) source Bash functions directly. Only Phase 3+ command-level tests need the dual-entry pattern.