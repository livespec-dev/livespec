## Why

The current plan calls for a VS Code-first way to inspect specs as they exist today, but the repository does not yet have a focused product contract for that experience. Creating LiveSpec now turns the plan into an implementable change with a narrow V1 scope: a single-file markdown viewer with tracked-item workflows and reliable navigation back to source.

## What Changes

- Rename the product surface from `SpecLens` to `LiveSpec` across documentation, package names, command IDs, view types, CSS variables, and internal types.
- Add a VS Code custom text editor for spec markdown files with strong markdown rendering, a compact toolbar, and VS Code theme integration.
- Parse GFM task-list items into tracked items with stable ID extraction, whole-document progress, incomplete-only filtering, multi-selection, copy-selected-ID actions, and keyboard interaction.
- Add host and webview synchronization for debounced document refresh, multiple editors per document, lightweight persisted state, and `Edit Source` navigation back to the authored markdown line.
- Add repository-level `.livespec/config.json` support so repositories can control spec-file discovery and shared parsing rules.
- Establish shared document-model and markdown parsing logic in `@livespec/core` for reuse by the VS Code extension and webview.
- Keep outline UI, collapsible sections, in-place editing, arbitrary embedded JS/JSX, and a general plugin system out of scope for this change.

## Capabilities

### New Capabilities

- `markdown-spec-viewer`: Open repository spec markdown files in a LiveSpec custom text editor with rendered markdown, theming, toolbar actions, and repo-configured file matching.
- `tracked-item-workflow`: Detect tracked checklist IDs from markdown and provide selection, copy, filtering, progress, and keyboard behaviors over visible tracked items.
- `source-navigation-and-sync`: Map rendered tracked items back to source lines, support `Edit Source`, refresh from document changes, and restore lightweight view state across reveals.
- `repository-configuration`: Load and validate `.livespec/config.json` so repositories can define spec-file globs and other shared LiveSpec parsing behavior.

### Modified Capabilities

- None.

## Impact

- Introduces a new workspace structure centered on `@livespec/core` and `@livespec/vscode`.
- Adds a VS Code extension host, webview UI bundle, and message contract between them.
- Adds markdown parsing and rendering dependencies in the `unified` / `remark` ecosystem plus configuration-schema validation.
- Requires renaming any existing SpecLens-facing docs and package surface to LiveSpec.
