## Context

LiveSpec is a greenfield implementation. The repository currently contains the product plan and OpenSpec artifacts, but no existing extension, package layout, or shared runtime code. The proposal commits this change to a narrow V1: a VS Code-first, markdown-first viewer for spec files as they exist today, with tracked-item workflows, whole-document progress, filtering, and reliable navigation back to source.

This design has to solve a few cross-cutting concerns up front:

- package boundaries for shared parsing logic versus VS Code-specific hosting
- repository-specific file matching via `.livespec/config.json`
- a custom editor lifecycle that supports multiple open views per document
- precise source mapping for `Edit Source`
- a secure webview with good markdown rendering and theme integration

The older SpecLens draft is useful as background, but this design intentionally rejects its outline sidebar, collapsible sections, and standalone renderer package. V1 is a single-column preview with a compact toolbar and a small host/webview message contract.

## Goals / Non-Goals

**Goals:**

- Create an initial workspace structure with `@livespec/core` and `@livespec/vscode`.
- Render matching spec markdown files in a LiveSpec custom text editor with VS Code theme integration.
- Extract tracked checklist items from markdown into typed metadata with stable IDs, completion state, label text, and source lines.
- Support multi-selection, copy-selected IDs, incomplete-only filtering, whole-document progress, keyboard interaction, and `Edit Source`.
- Refresh from `TextDocument` updates, support multiple editors per document, and persist lightweight semantic state across webview hide/reveal cycles.
- Establish configuration loading and validation for `.livespec/config.json` without baking repo-specific behavior into the extension code.

**Non-Goals:**

- Outline sidebars, scroll spy, or section collapse UI.
- In-place markdown editing, WYSIWYG editing, or block editing flows.
- Arbitrary embedded JS / JSX, MDX, or a general plugin system.
- A standalone Electron or web host in V1.
- Resolving future live blocks in this change beyond keeping the document model extensible.

## Decisions

### 1. Use a two-package workspace: `@livespec/core` and `@livespec/vscode`

The root workspace should be bootstrapped as a small monorepo with shared TypeScript configuration and two packages:

- `packages/core`: markdown parsing, tracked-item extraction, typed document model, config schema validation, and source-mapping utilities
- `packages/vscode`: extension host code plus the webview bundle

This keeps the reusable parts in one place without prematurely inventing a host-agnostic renderer API. The earlier `@speclens/renderer` idea is rejected because the only proven reuse target is parsing and document metadata, not the whole React shell.

### 2. Implement LiveSpec as a `CustomTextEditorProvider`

The extension should use `CustomTextEditorProvider` rather than a full custom editor document type. The underlying files remain normal markdown `TextDocument`s, so VS Code should continue to own save, undo/redo, hot exit, and normal text editing.

The provider will use a dedicated view type such as `livespec.preview`, and users must still be able to switch back to the normal text editor with `Open With...`.

Alternative considered:

- A full custom editor document model was rejected because it would duplicate text-document behavior and make source synchronization harder for no benefit.

### 3. Use config-driven matching, with guarded auto-open for matching markdown files

Repository configuration is a hard requirement, but custom-editor selectors in `package.json` are static. To support a repo-defined glob in `.livespec/config.json`, the extension should separate "can open in LiveSpec" from "should auto-open in LiveSpec":

- Declare the custom editor broadly enough that LiveSpec can be opened for markdown files when requested.
- Resolve the effective repo config from the workspace folder that contains the file, defaulting to `**/specs/**/*.md` when no config exists.
- When a markdown document is opened in the normal text editor and matches the effective glob, reopen it with `vscode.openWith` and the LiveSpec view type.
- Do not auto-open non-matching markdown files.

This approach satisfies repo-specific matching without taking over arbitrary markdown by default. It also keeps `.livespec/config.json` as the checked-in contract instead of relying on editor-local associations.

Alternatives considered:

- A static `**/specs/**/*.md` custom-editor selector was rejected because it cannot honor repo overrides.
- Taking over all markdown as the default editor was rejected because it violates the product scope and would be disruptive.

### 4. Parse in `@livespec/core`, render in the webview, and keep host/webview messages narrow

The extension host should send raw document snapshots and config/theme changes to each webview. The webview should use `@livespec/core` to parse markdown into a typed `LiveSpecDocument` and use `react-markdown` for rendering.

The message contract should stay close to the plan:

- Host -> webview: `documentUpdated({ text, version })`, `themeChanged`, `configChanged`
- Webview -> host: `copySelectedIds({ ids })`, `editSource({ line })`, `selectionChanged({ ids })`, `ready`

The host should not serialize ASTs or rendered HTML into messages. Sending raw text keeps the boundary stable, avoids AST transport overhead, and lets the webview render from the same parsing library the tests will exercise.

Alternative considered:

- Parsing in the host and sending a precomputed AST was rejected because it complicates message payloads and still leaves the webview responsible for markdown rendering.

### 5. Detect tracked items from the markdown AST, not raw lines

Tracked-item extraction belongs in `@livespec/core` and should be built on `unified`, `remark-parse`, and `remark-gfm`. The extraction rule is:

- only GFM task-list items count
- the first meaningful inline token must begin with a valid tracked-item ID
- leading whitespace is ignored
- IDs wrapped in emphasis or strong markup still count
- IDs inside inline code do not count
- the ID must be followed by end-of-text or a non-word separator

Each extracted item should include at least:

- `id`
- `completed`
- `line`
- `labelText`
- a stable runtime key derived from source position for DOM identity and range selection

The runtime key is important even though selection is presented as IDs. It avoids UI ambiguity when a file accidentally repeats an ID and gives the webview a stable anchor for scrolling and focus management.

Alternatives considered:

- Raw line regex matching was rejected because it is brittle around nested markdown and cannot reliably support source mapping.

### 6. Keep progress whole-document, and treat filtering as a view concern

`LiveSpecDocument` should compute progress from all tracked items in the file, regardless of filter state. The incomplete-only toggle changes which items are visible and focusable, but it must not redefine document completion.

Selection should operate over visible items, with these rules:

- click selects one item
- Ctrl/Cmd+click toggles one item
- Shift+click selects a visible range
- Tab and Shift+Tab move focus across visible items
- Space toggles the focused item in selection
- Ctrl/Cmd+A selects all currently visible items
- Escape clears selection
- applying the incomplete-only filter removes hidden items from selection

This yields stable progress summaries while keeping selection behavior predictable.

### 7. Manage refresh in the host and persist only semantic webview state

The extension host should own document lifecycle and fan out updates to every open webview for the same `TextDocument`. The recommended model is:

- register one `workspace.onDidChangeTextDocument` listener
- debounce reparsing/rerender notifications by about 200 ms per document URI
- on each debounce flush, send a single `documentUpdated` snapshot to every open panel for that document

The webview should persist lightweight state with `getState` / `setState`:

- selected tracked-item IDs
- incomplete-only toggle
- scroll anchor based on the first visible tracked item, with nearest source line as fallback

`retainContextWhenHidden` is explicitly not needed. Semantic state is smaller, survives document edits better, and avoids retaining a full React tree per hidden editor.

### 8. Put repo config validation and webview security into the foundation

`.livespec/config.json` should be versioned and validated in `@livespec/core`. V1 should support:

- `version`
- `specFileGlob`
- a reserved place for future parsing rules such as tracked-item ID configuration

The extension host should load config from the workspace folder containing the current file and fall back to defaults when the file is missing or invalid.

The webview should start with a restrictive content security policy, external JS/CSS bundles, constrained `localResourceRoots`, and markdown rendering that does not depend on injecting unsanitized HTML. Theme styling should be based on VS Code CSS variables from the first commit, with light, dark, and high-contrast smoke coverage.

## Risks / Trade-offs

- [Dynamic auto-open may feel surprising] -> Only reopen markdown files that match the effective repo glob, avoid loops by checking the current view type, and preserve easy escape via `Open With...`.
- [Selection state is expressed as IDs but duplicate IDs may exist] -> Use source-position-based runtime keys internally and fall back to source-line anchors when restoring state.
- [Parsing happens once per visible webview rather than once per document] -> Accept the small duplicate work in V1 because spec files are expected to be modest in size and raw-text messaging keeps the architecture simpler.
- [Static package contributions cannot perfectly mirror dynamic repo config] -> Make the runtime match decision authoritative and keep the package contribution broad enough only to enable `openWith`.
- [Theme fidelity can regress across VS Code themes] -> Build on theme variables only, keep component styling shallow, and smoke-test light, dark, and high-contrast themes during implementation.

## Migration Plan

This is a greenfield change, so migration is mostly sequencing rather than data conversion:

1. Scaffold the root workspace and create `packages/core` plus `packages/vscode`.
2. Rename remaining SpecLens-facing surface area to LiveSpec as part of the initial commit set.
3. Implement config loading, markdown parsing, tracked-item extraction, and fixture tests in `@livespec/core`.
4. Implement the VS Code extension shell, command registration, and custom-editor lifecycle.
5. Build the webview UI, connect host/webview messaging, and add selection, filtering, progress, and `Edit Source`.
6. Add multi-editor refresh behavior, lightweight state restore, and theme/accessibility polish.

Rollback is straightforward because no authored file format changes. Disabling or reverting the extension returns repositories to normal markdown editing.

## Open Questions

- Should V1 expose tracked-item ID pattern overrides in `.livespec/config.json`, or should config be limited to `specFileGlob` until a concrete second repo needs custom parsing?
- Should duplicate tracked-item IDs produce an explicit warning in the UI, or remain silently supported through runtime keys alone?
- If automatic `openWith` on matching files feels too aggressive in practice, should the extension fall back to a one-time workspace prompt before switching editors automatically?
