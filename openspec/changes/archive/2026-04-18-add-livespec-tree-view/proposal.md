## Why

LiveSpec currently depends on opening individual markdown files into a custom editor, which makes it awkward to browse a repository's full spec set and puts discovery on generic file navigation instead of a LiveSpec-owned workflow. A tree-first experience in the VS Code Activity Bar is the intended product direction and should become the primary way users find and open specs.

## What Changes

- Add a dedicated LiveSpec view container in the VS Code Activity Bar with a LiveSpec-owned tree of specs for the current repository.
- Add a fast "open spec" launcher command that lets users search for specs by name and open the selected spec in the LiveSpec viewer.
- Introduce a tree-first browsing flow where selecting a spec from the tree or launcher opens the current spec in the editor-area LiveSpec viewer.
- Show specs in the tree from a defined repository root directory, defaulting to `specs/`, and allow that root spec directory to be overridden in `.livespec/config.json`.
- Update LiveSpec's viewer entry behavior so the tree and launcher are the primary navigation surfaces instead of relying on implicit per-file opening behavior.
- Keep LLM chat out of scope for this change and rely on VS Code's existing chat UI.

## Capabilities

### New Capabilities
- `spec-tree-navigation`: Provide a LiveSpec Activity Bar view container with a repository spec tree, tree-based opening of specs, and a searchable command-based launcher for quickly opening a specific spec.

### Modified Capabilities
- `markdown-spec-viewer`: Change the viewer workflow so LiveSpec participates in a tree-first navigation model instead of depending on implicit direct-file entry as the primary UX.
- `repository-configuration`: Extend repository configuration so a configurable root spec directory, defaulting to repo-root `specs/`, drives which specs appear in the LiveSpec tree and launcher results.

## Impact

- Affects `packages/vscode` extension contributions, activation, commands, and repository/spec discovery flow.
- Adds a VS Code `TreeView` and Activity Bar view container owned by LiveSpec.
- Updates the LiveSpec viewer open path and how it coordinates with repository discovery.
- Does not add any new LLM or chat-specific functionality.
