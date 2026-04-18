## ADDED Requirements

### Requirement: LiveSpec extracts tracked items from GFM task lists
The system SHALL treat a checklist item as a tracked item only when it is a GFM task-list item whose first meaningful inline token begins with a valid tracked-item ID.

#### Scenario: Leading plain-text ID is tracked
- **WHEN** a GFM task-list item begins with a valid ID such as `T001`, `SC-001`, or `REQ-42`
- **THEN** LiveSpec records the item as a tracked item with its ID, completion state, label text, and source line

#### Scenario: Emphasized leading ID is tracked
- **WHEN** a GFM task-list item begins with a valid ID wrapped in emphasis or strong markup
- **THEN** LiveSpec still records the item as a tracked item using that ID

#### Scenario: Inline-code ID is not tracked
- **WHEN** a GFM task-list item begins with text wrapped in inline code that resembles an ID
- **THEN** LiveSpec does not treat the checklist item as a tracked item

#### Scenario: Non-leading ID is not tracked
- **WHEN** a GFM task-list item contains a valid ID later in the text but not at the first meaningful token
- **THEN** LiveSpec does not treat the checklist item as a tracked item

### Requirement: LiveSpec supports tracked-item selection and keyboard interaction
The system SHALL let users select visible tracked items by mouse and keyboard.

#### Scenario: Click selects one item
- **WHEN** a user clicks a visible tracked item without modifier keys
- **THEN** LiveSpec selects that item and clears any previous selection

#### Scenario: Modifier click toggles one item
- **WHEN** a user Ctrl-clicks or Cmd-clicks a visible tracked item
- **THEN** LiveSpec toggles that item in the current selection

#### Scenario: Shift-click selects a visible range
- **WHEN** a user Shift-clicks a visible tracked item after selecting another visible tracked item
- **THEN** LiveSpec selects the contiguous visible range between the anchor item and the clicked item

#### Scenario: Keyboard selection works on visible items
- **WHEN** a tracked item has keyboard focus and the user presses Space, Escape, Tab, Shift+Tab, or Ctrl/Cmd+A
- **THEN** LiveSpec applies the documented selection behavior for visible tracked items

### Requirement: LiveSpec supports copy-selected IDs
The system SHALL provide a way to copy the IDs of the currently selected tracked items.

#### Scenario: Copy selected IDs command
- **WHEN** a user invokes the copy-selected-IDs action while tracked items are selected
- **THEN** LiveSpec copies the selected tracked-item IDs in selection order to the clipboard

#### Scenario: Copy action with no selection
- **WHEN** a user invokes the copy-selected-IDs action while no tracked items are selected
- **THEN** LiveSpec does not copy any IDs and keeps the selection empty

### Requirement: LiveSpec provides whole-document progress and incomplete-only filtering
The system SHALL compute progress against all tracked items in the current document and SHALL treat incomplete-only filtering as a view-level filter.

#### Scenario: Progress counts the whole document
- **WHEN** a document contains both complete and incomplete tracked items
- **THEN** the progress summary reports totals using all tracked items in the document

#### Scenario: Incomplete-only hides completed items
- **WHEN** a user enables the incomplete-only filter
- **THEN** LiveSpec hides completed tracked items from the visible list

#### Scenario: Hidden items are removed from selection
- **WHEN** the incomplete-only filter hides tracked items that were selected
- **THEN** LiveSpec removes those hidden items from the current selection
