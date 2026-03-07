## ADDED Requirements

### Requirement: Commit Message Format Validation

The system SHALL validate all commit messages against Conventional Commits specification before allowing the commit to proceed.

#### Scenario: Valid commit message

- **WHEN** user commits with message "feat: add user authentication"
- **THEN** system accepts the commit
- **AND** commit proceeds normally

#### Scenario: Valid commit message with scope

- **WHEN** user commits with message "fix(auth): resolve login timeout"
- **THEN** system accepts the commit
- **AND** commit proceeds normally

#### Scenario: Invalid commit message - missing type

- **WHEN** user commits with message "add user authentication"
- **THEN** system rejects the commit
- **AND** displays error message indicating missing type prefix
- **AND** shows valid format examples

#### Scenario: Invalid commit message - invalid type

- **WHEN** user commits with message "update: change config"
- **THEN** system rejects the commit
- **AND** displays error message indicating invalid type
- **AND** shows list of valid types (feat/fix/refactor/docs/test/chore)

### Requirement: Commit Message Length Validation

The system SHALL validate commit message first line length to ensure readability.

#### Scenario: Valid message length

- **WHEN** user commits with first line "feat: add new feature" (19 characters)
- **THEN** system accepts the commit

#### Scenario: Message exceeds 50 characters

- **WHEN** user commits with first line exceeding 50 characters
- **THEN** system rejects the commit
- **AND** displays error message indicating line is too long
- **AND** shows character count

### Requirement: Error Messages and Guidance

The system SHALL provide clear error messages and guidance when validation fails.

#### Scenario: Display format guidance

- **WHEN** commit validation fails
- **THEN** system displays expected format: `<type>: <description>`
- **AND** displays list of valid types
- **AND** displays character limit (50 for first line)
- **AND** displays example valid commits

### Requirement: Hook Installation

The system SHALL provide a script to install the Git hook.

#### Scenario: Install hook script

- **WHEN** developer runs `scripts/setup-git-hooks.sh`
- **THEN** script copies commit-msg hook to `.git/hooks/`
- **AND** makes the hook executable
- **AND** displays success message

#### Scenario: Hook already installed

- **WHEN** developer runs setup script when hook already exists
- **THEN** script prompts to overwrite or skip
- **AND** respects user choice
