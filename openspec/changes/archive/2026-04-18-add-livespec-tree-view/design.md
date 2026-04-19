## Context

LiveSpec already has a working custom text editor for viewing spec markdown, document synchronization for multiple open panels, repository-level config loading, and a markdown/tracked-item rendering path. The current UX is still file-entry-driven: users arrive by opening markdown files and LiveSpec reopens matching files into the custom editor.

This change shifts LiveSpec to the product direction implied by the proposal: discovery and navigation should be owned by LiveSpec itself. The new UX needs to add a repository spec tree in the Activity Bar, a fast command-based launcher for opening a spec by name, and a tree-first detail flow that keeps the current editor-area viewer. It must do this without adding a custom chat surface and while making the tree's scope explicit: spec files should be shown from a configured root directory, defaulting to `specs/` at the repository root.

The design has to resolve a few cross-cutting concerns:

- where the LiveSpec navigation UI lives in the VS Code workbench
- how tree items and the launcher share one discovery model
- how repository config defines the root spec directory and effective spec set
- how the current custom editor remains available without staying the primary entry path
- how tree contents refresh when files or config change

## Goals / Non-Goals

**Goals:**

- Add a dedicated LiveSpec Activity Bar view container with a LiveSpec-owned spec tree.
- Keep the current LiveSpec custom text editor as the detail viewer in the editor area.
- Add a `LiveSpec: Open Spec...` launcher command backed by the same repository spec index as the tree.
- Use repository config and a configurable root spec directory, defaulting to `specs/` at the repository root, to decide which files appear in the tree and launcher.
- Make the tree and launcher the primary way to open specs in LiveSpec.
- Preserve existing viewer behavior for markdown rendering, tracked items, progress, filtering, and `Edit Source`.

**Non-Goals:**

- Add an in-webview outline sidebar or a split-pane tree inside the editor webview.
- Add any new LLM chat, chat participant, or chat-specific UI in this change.
- Replace markdown files with a new document format or move authored specs out of the workspace.
- Add non-file-backed generated nodes with custom detail views in this iteration.
- Redesign the current spec viewer beyond the minimal changes needed to support tree-first entry.

## Decisions

### 1. Contribute a dedicated `LiveSpec` view container in the Activity Bar

LiveSpec should contribute its own view container via `contributes.viewsContainers.activitybar` and place a `TreeView` inside it via `contributes.views`. This gives LiveSpec an owned navigation surface that is visible, thematically aligned with VS Code, and still movable by the user to the panel or secondary sidebar if they prefer.

This is the right default for the intended three-pane mental model:

- left: LiveSpec tree
- center: LiveSpec viewer in the editor
- right: existing VS Code chat UI

Alternatives considered:

- Contributing the tree to Explorer was rejected because it makes LiveSpec feel like a small helper attached to file browsing instead of a first-class product surface.
- Embedding the tree inside the viewer webview was rejected because it duplicates native workbench navigation and makes the viewer heavier, less native, and harder to keep accessible.
- Putting both tree and detail in sidebar/panel views was rejected because long-form spec reading belongs in the editor area.

### 2. Keep `CustomTextEditorProvider` as the detail surface, but stop relying on automatic file opening as the primary UX

The current LiveSpec viewer should remain a `CustomTextEditorProvider`. Markdown files stay normal `TextDocument`s, and the existing viewer/webview code continues to own rendering and document synchronization.

What changes is the entry model:

- tree selection opens a spec in the LiveSpec viewer with `vscode.openWith`
- the launcher command opens a spec in the LiveSpec viewer with the same path
- direct file opening in Explorer should remain normal markdown behavior unless the user explicitly chooses `Open With...`

Implementation-wise, this means removing the current auto-open flow that watches visible text editors and reopens matching markdown into LiveSpec. The custom editor contribution should stay `priority: "option"` so LiveSpec remains available as an alternate editor, but it should no longer take over the normal markdown open path on behalf of the user.

The broad markdown selector is still needed because `customEditors` selectors are static while repository matching is dynamic. Runtime logic remains authoritative about which files count as specs for the tree and launcher.

Alternatives considered:

- Keeping the auto-open behavior was rejected because it conflicts with the tree-first UX and makes the tree feel redundant.
- Replacing the custom editor with a pure webview panel was rejected because the current viewer already benefits from `TextDocument` lifecycle integration, split editors, and `Open With...`.

### 3. Introduce a shared extension-host `SpecIndex` for discovery, tree data, and launcher results

The tree view and quick-open launcher should both read from one extension-host discovery service instead of performing their own scans. This service should:

- resolve the repository root for each workspace contribution
- load the effective LiveSpec config for that repository, including a new `specRootDir` setting
- derive the effective root spec directory from config, defaulting to `specs`
- enumerate markdown files recursively under `<repositoryRoot>/<specRootDir>`
- emit a normalized list of spec entries with repository root, URI, relative path, file name, and stable item ID

This index becomes the source of truth for:

- tree nodes
- quick-pick items
- "reveal active spec" behavior
- refresh logic

The index should be file-based in this change. It should not parse headings or document contents to build labels. Tree labels should use filenames and folder structure under the configured spec root so discovery stays cheap and deterministic.

`specRootDir` should be resolved relative to the repository root. With no override present, LiveSpec should treat `<repositoryRoot>/specs` as the tree and launcher root. Files outside that configured root should not appear in the tree or quick launcher even if they are otherwise valid markdown files.

Alternatives considered:

- Letting the tree scan files while the launcher runs its own `findFiles` query was rejected because it would duplicate config resolution and drift over time.
- Parsing document headings to name tree items was rejected because it adds content-dependency and refresh churn without being required for the first tree UX.
- Using only a free-form glob without a defined root directory was rejected because the tree needs a clear navigation root and predictable folder structure.

### 4. Model the tree as repository/folder/spec nodes, with minimal UI chrome

The tree should mirror the logical spec file hierarchy, not invent a new navigation taxonomy. The model should support three node types:

- repository root nodes when needed for multi-root workspaces
- folder nodes for nested directories
- spec file leaf nodes

In a single-repository workspace, the tree can omit an extra repository wrapper and show folders/specs directly from the configured spec root. In multi-root workspaces, repository nodes should disambiguate identical relative paths across roots.

The configured spec root directory defines the visible top of the tree. Path segments above that root are never shown. For the default case, the tree therefore shows the contents of repo-root `specs/` rather than the entire repository hierarchy.

Each spec leaf should carry:

- a stable ID derived from repository root plus relative path
- the target file URI
- a command to open the file in LiveSpec
- file icon semantics so the tree looks native

The initial tree should stay restrained:

- no in-tree progress badges
- no in-tree chat affordances
- no deep inline action clutter beyond standard context/open actions

This keeps the surface aligned with VS Code view guidance and leaves room for future generated nodes later.

### 5. Add a `LiveSpec: Open Spec...` quick launcher backed by the same spec index

LiveSpec should add a command such as `livespec.openSpec` that opens a `showQuickPick` over the current spec index. Each item should include:

- label: file name
- description: relative folder/path context
- detail: repository root or workspace folder when needed for disambiguation

The quick pick should enable matching on description/detail so users can search by file name or path fragments. Picking an item should open the spec in LiveSpec using the same open path as the tree.

This command is the fast path for users who know what they want and do not want to navigate the tree manually. It also addresses the explicit requirement for a popup search flow.

Alternatives considered:

- Relying only on the tree was rejected because large spec sets need a keyboard-first path.
- Building a custom in-webview search box was rejected because Quick Pick is the native VS Code pattern for this action.

### 6. Refresh the tree/index from workspace file events and config changes, not from viewer document-sync events

The existing viewer should continue to refresh from `workspace.onDidChangeTextDocument`; that logic is about document contents. The tree/index is different because it depends on the set of matching files and effective repository config.

The spec index should refresh when:

- matching markdown files are created, deleted, or renamed
- `.livespec/config.json` files are created, changed, deleted, or renamed
- the user invokes an explicit refresh action from the LiveSpec view title or command palette

The implementation should prefer filesystem/workspace events that catch external changes as well as in-editor operations. A refresh should rebuild the index snapshot and then:

- fire `onDidChangeTreeData`
- update launcher data
- allow reveal/open commands to target the new snapshot

This keeps discovery accurate without coupling tree updates to every text edit in every markdown file. It also ensures changes to `specRootDir` immediately re-root the tree and launcher contents.

### 7. Add explicit tree-focused commands and separate them from viewer commands

The extension should keep the current viewer commands intact and add new navigation commands that are scoped to the tree/discovery surface. The minimum set is:

- `livespec.openSpec`
- `livespec.refreshSpecTree`
- `livespec.revealActiveSpec`

Existing viewer commands such as `livespec.copySelectedIds`, `livespec.toggleIncompleteOnly`, `livespec.editSource`, and `livespec.refresh` should remain viewer-scoped.

This separation avoids overloading a single `refresh` concept and keeps the view-title actions straightforward:

- tree view title: open spec, refresh tree, reveal active spec
- viewer toolbar/command path: refresh document, edit source, tracked-item actions

### 8. Keep chat out of the extension UI entirely

This change should not contribute a chat view, chat participant, or embedded chat panel. The design assumes that users who want the three-pane workflow will use VS Code's existing chat UI in the secondary sidebar or panel.

This is both a product-scope decision and a UX decision. Native VS Code chat already solves layout, persistence, and interaction patterns better than a custom LiveSpec chat pane would at this stage.

## Risks / Trade-offs

- [Broad custom-editor selector still allows manual `Open With LiveSpec` on arbitrary markdown] -> Accept this as the cost of dynamic repository matching; make the tree and launcher authoritative for the normal LiveSpec workflow.
- [Scanning workspace markdown to build the spec index can become expensive in large repos] -> Scope discovery to the configured root spec directory, cache a normalized snapshot, refresh on discrete file/config events, and keep labels file-path-based so index rebuilds stay cheap.
- [Removing auto-open changes behavior for users who expect matching files to jump into LiveSpec automatically] -> Make the Activity Bar entry and `Open Spec...` command prominent so the new primary workflow is obvious.
- [Tree state can drift after file moves or config edits] -> Rebuild the full index on create/delete/rename/config events instead of trying to patch individual nodes in place.
- [Multi-root workspaces can produce confusing duplicates] -> Include repository-level disambiguation in the tree and launcher whenever more than one repository contributes specs.
- [A misconfigured root spec directory can produce an unexpectedly empty tree] -> Validate `specRootDir`, fall back to the default `specs` directory when config is invalid, and show a clear empty-state message when the configured root exists but contains no spec files.

## Migration Plan

1. Add the new LiveSpec Activity Bar view container, tree view contribution, and command registrations.
2. Implement the shared spec index in the extension host and connect it to repository config loading plus `specRootDir` resolution.
3. Build the `TreeDataProvider` and wire tree selection to `vscode.openWith` for the LiveSpec viewer.
4. Add the `LiveSpec: Open Spec...` quick-pick command and the `Reveal Active Spec` command using the same index snapshot.
5. Remove the existing auto-open behavior that reopens matching markdown files into LiveSpec on ordinary editor open.
6. Keep the current viewer/webview behavior intact, adjusting only the viewer entry path and any labels/tooling that now assume tree-first navigation.
7. Add tests for spec discovery, tree shaping, launcher data, and the revised open behavior.

Rollback is straightforward: removing the tree and command contributions returns LiveSpec to a file-open-driven alternative editor, and authored markdown files remain unchanged throughout.

## Open Questions

- Should the tree always mirror on-disk filenames, or should a later change optionally promote the first H1/title into the display label while keeping filenames in descriptions?
- Should opening from the tree use preview tabs by default, or should LiveSpec pin opened specs immediately to favor longer reading sessions?
