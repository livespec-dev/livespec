## ADDED Requirements

### Requirement: LiveSpec opens matching spec markdown files
The system SHALL provide a LiveSpec custom text editor for repository markdown files that match the effective spec-file glob.

#### Scenario: Matching file opens in LiveSpec
- **WHEN** a user opens a markdown file whose path matches the effective spec-file glob for its repository
- **THEN** VS Code opens the file in the LiveSpec custom text editor

#### Scenario: Non-matching markdown stays in the normal editor
- **WHEN** a user opens a markdown file whose path does not match the effective spec-file glob
- **THEN** the file remains in the normal text editor unless the user explicitly chooses LiveSpec

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
