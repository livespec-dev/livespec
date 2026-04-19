## MODIFIED Requirements

### Requirement: LiveSpec opens matching spec markdown files
The system SHALL provide a LiveSpec custom text editor for repository spec markdown files and SHALL open a spec in LiveSpec when the user selects it from LiveSpec-owned navigation surfaces or explicitly chooses the LiveSpec editor.

#### Scenario: Tree selection opens a spec in LiveSpec
- **WHEN** a user selects a discovered spec file from the LiveSpec tree
- **THEN** VS Code opens that file in the LiveSpec custom text editor

#### Scenario: Open Spec launcher opens a spec in LiveSpec
- **WHEN** a user selects a discovered spec file from `LiveSpec: Open Spec...`
- **THEN** VS Code opens that file in the LiveSpec custom text editor

#### Scenario: Direct file open stays in the normal editor
- **WHEN** a user opens a spec markdown file from Explorer, Quick Open, or another standard VS Code file-navigation surface
- **THEN** the file remains in the normal text editor unless the user explicitly chooses LiveSpec

#### Scenario: Explicit Open With uses LiveSpec
- **WHEN** a user explicitly opens a spec markdown file with the LiveSpec editor
- **THEN** VS Code opens the file in the LiveSpec custom text editor
