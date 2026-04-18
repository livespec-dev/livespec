## 1. Workspace Foundation

- [x] 1.1 Scaffold the root workspace with shared TypeScript config plus `packages/core` and `packages/vscode`
- [x] 1.2 Rename remaining `SpecLens`-facing identifiers, package names, command IDs, view types, and docs to `LiveSpec`
- [x] 1.3 Add build scripts and package wiring for the extension host and webview bundle

## 2. Core Parsing And Configuration

- [x] 2.1 Implement `@livespec/core` config loading, default resolution, and schema validation for `.livespec/config.json`
- [x] 2.2 Define the typed `LiveSpecDocument` and tracked-item model used by the extension and webview
- [x] 2.3 Build the markdown parsing pipeline with `remark-parse` and `remark-gfm`
- [x] 2.4 Implement tracked-item extraction, progress calculation, and source-line mapping from the markdown AST
- [x] 2.5 Add fixture tests for config fallback, tracked-item ID edge cases, and whole-document progress behavior

## 3. VS Code Host And Editor Lifecycle

- [x] 3.1 Register the LiveSpec extension commands and `CustomTextEditorProvider`
- [x] 3.2 Implement repo-aware matching so files that satisfy the effective spec-file glob open in LiveSpec without taking over unrelated markdown
- [x] 3.3 Wire `workspace.onDidChangeTextDocument` with debounced document snapshots shared across all open LiveSpec editors for the same file
- [x] 3.4 Implement host-side handling for `copySelectedIds`, `editSource`, `ready`, and `selectionChanged` webview messages

## 4. Webview Rendering And Interaction

- [x] 4.1 Build the webview shell with a restrictive CSP, external bundled assets, constrained local resources, and VS Code theme variables
- [x] 4.2 Render the markdown document, compact toolbar, file name, and whole-document progress summary in the LiveSpec view
- [x] 4.3 Implement empty-document, filtered-empty, and degraded parsing states
- [x] 4.4 Implement tracked-item focus, mouse selection, keyboard interaction, copy-selected-ID flow, and incomplete-only filtering
- [x] 4.5 Implement semantic state persistence for selected IDs, incomplete-only mode, and scroll-anchor restore across hide and reveal

## 5. Verification And Polish

- [x] 5.1 Verify multiple LiveSpec editors for the same document stay synchronized after local and external document changes
- [x] 5.2 Smoke-test light, dark, and high-contrast themes plus keyboard focus behavior for tracked items and toolbar actions
- [x] 5.3 Add integration coverage for matching-file open behavior, `Edit Source`, and webview refresh from document updates
