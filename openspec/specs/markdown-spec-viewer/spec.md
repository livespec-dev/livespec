## Purpose

Define how LiveSpec opens and renders matching spec markdown files in VS Code, including theme-aware presentation and explicit empty or degraded states.

## Requirements

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

### Requirement: LiveSpec renders markdown with document context
The system SHALL render the opened spec markdown as a single-document preview with a compact toolbar that includes the file name and whole-document progress summary.

#### Scenario: Render markdown document
- **WHEN** LiveSpec opens a matching spec file
- **THEN** the webview renders the markdown body and shows the file name plus whole-document progress in the toolbar

#### Scenario: Render markdown with no tracked items
- **WHEN** LiveSpec opens a matching spec file that contains no tracked checklist items
- **THEN** the markdown body still renders normally without showing a degraded-state error

### Requirement: LiveSpec uses VS Code theme-aware presentation
The system SHALL style the LiveSpec preview using VS Code theme variables so the preview remains usable in light, dark, and high-contrast themes.

#### Scenario: Theme changes while document is open
- **WHEN** the active VS Code theme changes while a LiveSpec editor is visible
- **THEN** the LiveSpec preview updates its styling to match the new theme

### Requirement: LiveSpec shows explicit empty and degraded states
The system SHALL distinguish between empty documents, filtered-empty views, and parsing failures.

#### Scenario: Empty document state
- **WHEN** LiveSpec opens a matching spec file whose content is empty
- **THEN** the preview shows an explicit empty-document state instead of a blank document body

#### Scenario: Filtered-empty state
- **WHEN** the incomplete-only filter hides every tracked item in the current document
- **THEN** the preview shows a filtered-empty state while preserving the whole-document progress summary

#### Scenario: Parsing fallback state
- **WHEN** markdown parsing or tracked-item extraction fails for the current document
- **THEN** the preview shows a clear degraded state with access to the source document instead of rendering a blank webview
