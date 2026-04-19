## 1. Repository Configuration And Discovery

- [x] 1.1 Extend the LiveSpec config model to support `specRootDir`, default it to repo-root `specs/`, and validate invalid overrides with safe fallback behavior
- [x] 1.2 Implement a shared extension-host spec index that resolves repository roots, applies the effective `specRootDir`, and enumerates spec markdown files under that root
- [x] 1.3 Add refresh triggers so the spec index rebuilds when spec files or `.livespec/config.json` change

## 2. Activity Bar Tree And Commands

- [x] 2.1 Contribute a dedicated LiveSpec Activity Bar view container, tree view, and tree-focused commands in the VS Code extension manifest
- [x] 2.2 Implement the LiveSpec `TreeDataProvider` with repository, folder, and spec-file nodes shaped from the shared spec index
- [x] 2.3 Wire tree actions for open, refresh, and reveal-active-spec behavior using the shared spec index snapshot

## 3. Viewer Entry And Launcher Flow

- [x] 3.1 Add `LiveSpec: Open Spec...` as a Quick Pick launcher that searches discovered specs by file name and path
- [x] 3.2 Route tree selection and launcher picks through `vscode.openWith` so specs open in the existing LiveSpec custom text editor
- [x] 3.3 Remove the current implicit auto-open behavior so direct file opens stay in the normal editor unless the user explicitly chooses LiveSpec

## 4. Verification And Polish

- [x] 4.1 Add unit coverage for `specRootDir` config resolution, spec-index discovery, and tree shaping across single-root and multi-root workspaces
- [x] 4.2 Add extension tests for tree-driven open, Open Spec launcher behavior, reveal-active-spec, and direct file-open fallback to the normal editor
- [x] 4.3 Polish tree empty states, command labels, and view-title actions so the tree-first LiveSpec workflow is clear in the workbench
