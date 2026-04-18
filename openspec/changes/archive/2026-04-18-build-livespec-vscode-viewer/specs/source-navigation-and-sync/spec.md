## ADDED Requirements

### Requirement: LiveSpec supports Edit Source navigation
The system SHALL let users open the authored markdown in the normal text editor at the relevant source line for the current tracked item or selection.

#### Scenario: Edit Source from a tracked item
- **WHEN** a user invokes `Edit Source` for a tracked item in LiveSpec
- **THEN** VS Code opens the underlying markdown file in the normal text editor at that tracked item's source line

#### Scenario: Edit Source from a selection
- **WHEN** a user invokes the toolbar `Edit Source` action while one or more tracked items are selected
- **THEN** VS Code opens the underlying markdown file at the relevant source line for the current selection

### Requirement: LiveSpec refreshes from text document changes
The system SHALL refresh the preview from `TextDocument` updates rather than a separate file watcher.

#### Scenario: Local text edit updates preview
- **WHEN** the underlying `TextDocument` changes because of typing, undo, or redo
- **THEN** LiveSpec reparses the document and updates the preview from the changed document contents

#### Scenario: External file change updates preview
- **WHEN** VS Code reflects an external file change into the open `TextDocument`
- **THEN** LiveSpec reparses the document and updates the preview from the changed document contents

#### Scenario: Debounced refresh uses one snapshot
- **WHEN** multiple document changes occur within the debounce window
- **THEN** LiveSpec updates the document body and progress summary from the same debounced parsed snapshot

### Requirement: LiveSpec supports multiple editors per document
The system SHALL keep multiple LiveSpec editors for the same markdown document synchronized.

#### Scenario: Multiple LiveSpec views stay in sync
- **WHEN** the same spec markdown document is open in more than one LiveSpec editor
- **THEN** each LiveSpec editor receives the refreshed document snapshot after the document changes

### Requirement: LiveSpec persists lightweight semantic state
The system SHALL persist semantic UI state across webview hide and reveal without retaining the full webview context.

#### Scenario: Restore selection and filter state
- **WHEN** a LiveSpec editor is hidden and later revealed for the same document
- **THEN** LiveSpec restores the selected tracked-item IDs and incomplete-only toggle from persisted webview state

#### Scenario: Restore scroll anchor semantically
- **WHEN** a LiveSpec editor is hidden and later revealed after the document changed
- **THEN** LiveSpec restores scroll position using the first visible tracked-item anchor or the nearest source-line fallback instead of a raw pixel offset
