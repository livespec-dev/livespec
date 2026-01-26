# SpecLens Design

Enhanced markdown preview for spec files with item selection, navigation, and progress tracking.

## Overview

**Purpose:** VS Code extension that provides an enhanced preview for spec files (`**/specs/**/*.md`) with selectable items, navigation, and progress tracking.

**Core features:**
- Enhanced markdown preview for spec files
- Selectable items with IDs (pattern: `[A-Z]+-?\d+` after checkboxes)
- Multi-select items → copy IDs to clipboard
- Outline panel with scroll-to navigation
- Progress summary (e.g., "8/15 complete")
- Filter toggle (show only incomplete items)
- "Open at line" (jump to source in text editor)

**Future scope:**
- Standalone viewer (Electron or web-based)
- Dynamic content generation mixed with markdown

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   VS Code Extension                  │
│  ┌───────────────┐    ┌──────────────────────────┐  │
│  │ Custom Editor │    │     Extension Host       │  │
│  │   Provider    │───▶│  - File watching         │  │
│  │               │    │  - Command registration  │  │
│  └───────┬───────┘    │  - Clipboard handling    │  │
│          │            └──────────────────────────┘  │
│          ▼                                          │
│  ┌───────────────────────────────────────────────┐  │
│  │              Webview Panel                     │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │         @speclens/renderer              │  │  │
│  │  │   (standalone npm package)              │  │  │
│  │  │   - remark/unified pipeline             │  │  │
│  │  │   - React components                    │  │  │
│  │  │   - Selection state management          │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

The rendering logic lives in a separate `@speclens/renderer` package. The VS Code extension hosts it in a webview, but the same package can later power a standalone Electron app or web viewer.

## VS Code Extension Structure

**Activation:** The extension activates when VS Code opens a workspace containing a `specs/` directory, or when a user opens any file matching `**/specs/**/*.md`.

**Custom Editor Provider:** Registers as the default editor for spec files:

```json
"customEditors": [{
  "viewType": "speclens.preview",
  "displayName": "SpecLens Preview",
  "selector": [{ "filenamePattern": "**/specs/**/*.md" }],
  "priority": "default"
}]
```

Spec files open in SpecLens automatically. Users can right-click → "Open With..." → "Text Editor" for raw markdown.

**Commands:**
- `speclens.copySelectedIds` - Copy selected item IDs to clipboard
- `speclens.toggleIncompleteOnly` - Toggle filter for incomplete items
- `speclens.openAtLine` - Open source file at current position in text editor
- `speclens.refresh` - Re-render preview

**File watching:** Extension watches the open spec file for external changes. If the file is modified outside VS Code (e.g., by an AI tool), the preview refreshes automatically.

**State management:** Selection state and filter preferences are kept in memory per-editor instance. Scroll position is preserved when the webview is hidden and restored.

## Rendering Pipeline

The remark/unified pipeline transforms markdown into interactive HTML:

```
┌──────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────┐
│ Markdown │───▶│ remark-parse│───▶│   Plugins   │───▶│  rehype  │───▶ React
│  source  │    │  (to AST)   │    │ (transform) │    │ (to HTML)│    components
└──────────┘    └─────────────┘    └─────────────┘    └──────────┘
```

**Custom remark plugins:**

1. **remark-speclens-items** - Detects selectable items matching pattern `- [ ] ID` or `- [x] ID` where ID is capital letters, optional hyphen, then digits. Annotates AST nodes with `itemId`, `completed` status, and source line number. Pattern: `/^\[[ xX]\]\s+([A-Z]+-?\d+)/`.

   Examples: `T001`, `SC-001`, `RF001`, `REQ-42`

2. **remark-speclens-headings** - Extracts heading hierarchy for the outline panel. Adds `id` anchors for scroll-to navigation.

3. **remark-speclens-progress** - Counts total/completed items per section and at document level. Injects progress metadata into the AST.

**React rendering:** The transformed AST is passed to `rehype-react`, which renders custom components:

- `<SelectableItem>` - Clickable/selectable item with ID badge
- `<Section>` - Collapsible section with progress indicator
- `<Outline>` - Sidebar navigation built from heading data

**Message passing:** The webview communicates with the extension host via `postMessage`:
- Webview → Host: `copyIds`, `openAtLine`, `selectionChanged`
- Host → Webview: `fileUpdated`, `themeChanged`

## Item Selection System

**Selection behavior:**
- **Click** on an item: Select it (deselects others)
- **Ctrl/Cmd + Click**: Toggle item in selection (multi-select)
- **Shift + Click**: Range select from last clicked item to current
- **Ctrl/Cmd + A** (when focus in item list): Select all visible items
- **Escape**: Clear selection

**Visual feedback:**
- Selected items have a highlighted background (respects VS Code theme colors)
- Selection count badge appears in the toolbar: "3 selected"
- Selected item IDs shown in a compact list in the toolbar (e.g., "T001, SC-001, RF001")

**Clipboard integration:**
- **Ctrl/Cmd + C** (when items selected): Copy IDs to clipboard
- Toolbar button: "Copy IDs" - same action
- Format: Comma-separated IDs, e.g., `T001, SC-001, RF001`
- Toast notification confirms: "Copied 3 item IDs"

**State management:** Selection state lives in React component state within the webview. It resets when:
- The file changes (automatic refresh)
- User navigates to a different spec file
- User manually clears with Escape

Selection persists when toggling the incomplete-only filter, but items hidden by the filter are automatically deselected.

## Navigation & Filtering

**Outline panel** appears as a collapsible sidebar on the left:

```
┌─────────────────┬────────────────────────────────┐
│ Outline         │                                │
│ ─────────────── │  ## Authentication Flow        │
│ ▼ Auth Flow     │                                │
│   ▼ Login       │  ### Login                     │
│     OAuth       │  - [x] T001 Setup OAuth...     │
│     Session     │  - [ ] T002 Handle tokens...   │
│   ▼ Logout      │                                │
│ ▼ Error Cases   │  ### Logout                    │
│                 │  - [ ] T003 Clear session...   │
└─────────────────┴────────────────────────────────┘
```

- Click heading → smooth scroll to section
- Current section highlighted as you scroll (scroll spy)
- Collapse/expand sections in outline
- Progress indicators next to headings: "Login (1/2)"

**Filter toggle** in the toolbar:
- Button: "Show incomplete only" / "Show all"
- When active, completed items (`[x]`) are hidden
- Progress summary updates to reflect visible items
- Keyboard shortcut: `Ctrl/Cmd + Shift + I`

**Progress summary** fixed at top of preview:
- Shows overall completion: "Progress: 8/15 items (53%)"
- Visual progress bar (thin, unobtrusive)
- Updates live when file changes

**"Open at line" action:**
- Right-click any element → "Open in Editor"
- Opens the `.md` file in VS Code's text editor, cursor at that line
- Also available via `Ctrl/Cmd + E` when hovering over content

## Package Structure

```
speclens/
├── packages/
│   ├── renderer/           # @speclens/renderer (npm package)
│   │   ├── src/
│   │   │   ├── pipeline/   # remark/unified plugins
│   │   │   ├── components/ # React components
│   │   │   └── index.ts    # Main exports
│   │   └── package.json
│   │
│   └── vscode/             # VS Code extension
│       ├── src/
│       │   ├── extension.ts
│       │   ├── editorProvider.ts
│       │   └── webview/    # Hosts @speclens/renderer
│       └── package.json
│
└── package.json            # Monorepo root (pnpm workspaces)
```

**Standalone viewer (future):** The `@speclens/renderer` package exports:
- `renderSpec(markdown: string)` → React component tree
- `parseSpec(markdown: string)` → AST with item/heading metadata
- All React components with their styles

A future Electron app or web server imports the package and wraps it in a shell with file loading.

**Dynamic content hooks (future):** The pipeline is designed for extension:
- Custom remark plugins can inject generated content
- Components accept render props for custom item actions
- Message protocol is extensible for new host → webview commands

## Out of Scope (Initial Version)

- Configuration files
- Plugin system
- Custom ID patterns
- Theming beyond VS Code's built-in themes

These can be added later if needed.
