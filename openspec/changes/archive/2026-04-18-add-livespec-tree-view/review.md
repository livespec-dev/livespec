# Review: add-livespec-tree-view

## Scope
**Reviewed artifacts:** proposal.md, design.md, tasks.md, specs/spec-tree-navigation/spec.md, specs/markdown-spec-viewer/spec.md, specs/repository-configuration/spec.md
**Reviewed code:**
- [packages/core/src/config.ts](packages/core/src/config.ts)
- [packages/core/test/config.test.ts](packages/core/test/config.test.ts)
- [packages/vscode/package.json](packages/vscode/package.json)
- [packages/vscode/src/constants.ts](packages/vscode/src/constants.ts)
- [packages/vscode/src/extension.ts](packages/vscode/src/extension.ts)
- [packages/vscode/src/repository.ts](packages/vscode/src/repository.ts)
- [packages/vscode/src/specIndex.ts](packages/vscode/src/specIndex.ts)
- [packages/vscode/src/specTree.ts](packages/vscode/src/specTree.ts)
- [packages/vscode/test/documentSync.test.ts](packages/vscode/test/documentSync.test.ts)
- [packages/vscode/test/extension.test.ts](packages/vscode/test/extension.test.ts)
- [packages/vscode/test/repository.test.ts](packages/vscode/test/repository.test.ts)
- [packages/vscode/test/specIndex.test.ts](packages/vscode/test/specIndex.test.ts)
- [packages/vscode/test/specTree.test.ts](packages/vscode/test/specTree.test.ts)

## Findings

### ✅ Verified - RF1 Config file changes made outside the editor leave open viewers with stale config
- **Severity:** Medium
- **Evidence:** [packages/vscode/src/extension.ts:241-254](packages/vscode/src/extension.ts#L241-L254) wires the new `.livespec/config.json` watcher to `refreshSpecTree` only. The only path that calls `broadcastConfig` is [packages/vscode/src/extension.ts:143-149](packages/vscode/src/extension.ts#L143-L149) via `onDidChangeTextDocument`, which only fires for edits made through the editor. Creating, deleting, or renaming `.livespec/config.json` from Explorer, git, or another process refreshes the tree index but never pushes the new config to panels registered in `LiveSpecPanelRegistry`. Open LiveSpec viewers keep rendering against the previous `specRootDir` until the viewer is re-opened.
- **Recommendation:** Have the config watcher also resolve the owning `repositoryRoot`, reload the config, and call `registry.broadcastConfig(repositoryRoot, config)` (mirroring `handleConfigChange`) before refreshing the tree. Consider consolidating into a single helper shared between the text-document change path and the file watcher path.
- **Fix:** Routed config file watcher create/change/delete events through the same config reload helper used by editor-driven config changes, so open panels now receive `broadcastConfig` updates before the tree refreshes.
- **Verification:** `registerConfigWatcher` subscribes all three events (create/change/delete) to `handleConfigPathChange`, which calls `broadcastConfig` then `refreshSpecTree`. Test "rebroadcasts config updates when the config watcher fires" confirms `broadcastConfig` is invoked on a watcher delete event. Fix is correct and complete.

### ✅ Verified - RF2 Markdown watcher rebuilds the entire spec index on every text edit
- **Severity:** Low
- **Evidence:** [packages/vscode/src/extension.ts:241-254](packages/vscode/src/extension.ts#L241-L254) registers `onDidChange` alongside `onDidCreate`/`onDidDelete` for `**/*.md`. The design explicitly scopes spec-index refresh to "matching markdown files are created, deleted, or renamed" ([design.md:143-158](openspec/changes/add-livespec-tree-view/design.md#L143-L158)) because content changes do not alter the discovered file set. Every keystroke in any workspace markdown file currently triggers `LiveSpecSpecIndex.refresh()`, which re-walks `vscode.workspace.findFiles("**/*.md")`, re-resolves repository roots, re-loads configs, and refires `onDidChangeTreeData`.
- **Recommendation:** Drop `onDidChange` for the markdown watcher (create+delete already cover VS Code's rename events). Keep `onDidChange` for the config watcher where content actually matters.
- **Fix:** Split the watcher setup so markdown files only trigger tree refreshes on create/delete, while config files still refresh on create/change/delete.
- **Verification:** `registerMarkdownTreeRefreshWatcher` subscribes only `onDidCreate` and `onDidDelete`. Test "registers markdown watchers without content-change refreshes" explicitly asserts `onDidChange` is never called on the markdown watcher while it is called on the config watcher. Fix is correct.

### ✅ Verified - RF3 `LiveSpecSpecIndex.refresh` re-walks filesystem for every markdown file
- **Severity:** Low
- **Evidence:** [packages/vscode/src/specIndex.ts:118-140](packages/vscode/src/specIndex.ts#L118-L140) awaits `findRepositoryRoot` once per markdown file. `findRepositoryRoot` in [packages/vscode/src/repository.ts:9-37](packages/vscode/src/repository.ts#L9-L37) walks from the file's directory up to the workspace boundary, issuing two `fs.access` probes per directory. In a workspace with many spec files this is sequential and quadratic in depth × file count. The change comment in design.md specifically warns about large-repo cost ([design.md:183-184](openspec/changes/add-livespec-tree-view/design.md#L183-L184)) and the existing `configCache` already demonstrates the pattern for memoisation.
- **Recommendation:** Memoise the directory→repositoryRoot resolution (either on the visited ancestor set or per-workspace-folder) so sibling files under the same root reuse a single walk.
- **Fix:** Added a directory-level repository-root cache in `LiveSpecSpecIndex.refresh()` so sibling and nested markdown files reuse the first resolved repository root instead of repeating the filesystem walk.
- **Verification:** `getRepositoryRoot` in `specIndex.ts` uses a `repositoryRootCache` map keyed by directory path. It walks up the directory tree checking the cache at each ancestor and stores the resolved result for all visited directories. Sibling and nested files hit the cache on the first ancestor lookup. Fix is correct.

### ✅ Verified - RF4 Quick Pick `detail` shows the absolute repository path instead of a human label
- **Severity:** Low
- **Evidence:** [packages/vscode/src/extension.ts:311-316](packages/vscode/src/extension.ts#L311-L316) sets `detail: entry.repositoryRoot` when more than one repository contributes specs. The spec index already carries `repositoryName` and `workspaceFolderName` ([packages/vscode/src/specIndex.ts:11-30](packages/vscode/src/specIndex.ts#L11-L30)); design.md:127-133 mentions "repository root or workspace folder when needed for disambiguation" but absolute filesystem paths read poorly in Quick Pick, especially on Windows or when repos live under deep home directories.
- **Recommendation:** Prefer `entry.repositoryName` (falling back to `workspaceFolderName`) for the detail line; keep `repositoryRoot` out of the surfaced UI unless duplicates require it.
- **Fix:** Replaced absolute repository paths in Quick Pick details with human-readable repository and workspace labels, using `repo-name (workspace-folder)` only when both are needed.
- **Verification:** `getRepositoryDetail` returns `entry.repositoryName` when it matches `workspaceFolderName`, or `"${repositoryName} (${workspaceFolderName})"` otherwise. Test "uses human-readable repository labels in multi-repository Quick Pick details" asserts `detail: "repo-a (workspace-a)"` and `detail: "workspace-b"`. Fix is correct.

### ✅ Verified - RF5 Tree file nodes show `relativePath` as description, duplicating the folder hierarchy
- **Severity:** Low
- **Evidence:** [packages/vscode/src/specTree.ts:204-218](packages/vscode/src/specTree.ts#L204-L218) always sets `item.description = element.entry.relativePath`. The tree already renders the folder path through collapsible `folder` nodes ([packages/vscode/src/specTree.ts:95-117](packages/vscode/src/specTree.ts#L95-L117)), so a spec at `alpha/spec.md` shows "spec.md" under a folder called "alpha" and an inline description "alpha/spec.md". This makes the tree look noisy and conflicts with task 4.3's polish goal.
- **Recommendation:** Either drop the file-node description (letting VS Code's file icon + label stand), or surface something more useful (e.g., only show description when the file lives directly under the spec root, or show just the file extension class).
- **Fix:** Removed the file-node description so the tree relies on the existing folder hierarchy and file icon semantics instead of duplicating the path inline.
- **Verification:** The `getTreeItem` file-node case in `specTree.ts` no longer sets `item.description`. Only `label`, `contextValue`, `resourceUri`, and `command` are assigned. Fix is correct.

### ✅ Verified - RF6 Direct file-open fallback is only asserted by a listener-absence proxy
- **Severity:** Low
- **Evidence:** Spec scenario "Direct file open stays in the normal editor" ([specs/markdown-spec-viewer/spec.md:14-16](openspec/changes/add-livespec-tree-view/specs/markdown-spec-viewer/spec.md#L14-L16)) and task 4.2 call for a behavioral test. The only coverage is [packages/vscode/test/extension.test.ts:322-341](packages/vscode/test/extension.test.ts#L322-L341), which asserts `onDidOpenTextDocument` and `onDidChangeVisibleTextEditors` are never called during activation. That proves the auto-open watchers aren't registered, but doesn't exercise a simulated file open.
- **Recommendation:** Add a test that simulates opening a spec markdown through the normal editor path (e.g., emit a document-open event on the mocked workspace) and asserts `vscode.openWith` is not invoked.
- **Fix:** Added an extension test that simulates a normal document-open event for a spec markdown file and asserts that LiveSpec does not call `vscode.openWith`.
- **Verification:** Test "does not reopen specs when a normal document-open event fires" activates the extension, fires `fireOpenTextDocument` with a spec markdown URI, and asserts `executeCommand` (the path to `vscode.openWith`) is never called. Fix is correct.

### ✅ Verified - RF7 `LiveSpec: Refresh Spec Tree` has no test coverage
- **Severity:** Low
- **Evidence:** The command is registered at [packages/vscode/src/extension.ts:120-122](packages/vscode/src/extension.ts#L120-L122) and contributed via the view-title menu, but neither `extension.test.ts` nor `specTree.test.ts` exercises invoking it or confirms the resulting `refreshSpecTree` → index rebuild → empty-state message flow. Task 2.3 asks for refresh behavior to be wired, and the tree's empty-state messaging in `updateTreeViewMessage` has no test at all beyond the "no workspace folders" branch.
- **Recommendation:** Add a test that populates the spec index, triggers refresh, and asserts that `findFiles` runs and `didChangeTreeData` fires. Also cover the "workspace opened but no specs" message branch.
- **Fix:** Added extension coverage for the `refreshSpecTree` command and its empty-state message update so the tree-refresh command path is exercised directly.
- **Verification:** Test "refreshes the tree and updates the empty-state message from the refresh command" invokes the registered `refreshSpecTree` command, asserts `refresh` is called, and checks the "No LiveSpec specs found" empty-state message. Fix is correct.

### ✅ Verified - RF8 View-title actions have no icons, so they collapse into the overflow menu
- **Severity:** Low
- **Evidence:** [packages/vscode/package.json:90-108](packages/vscode/package.json#L90-L108) contributes openSpec/refreshSpecTree/revealActiveSpec under `menus.view/title`, but none of the command definitions at [packages/vscode/package.json:31-59](packages/vscode/package.json#L31-L59) include an `icon` field. Without icons, VS Code hides these entries behind the `…` overflow on the view header, which undercuts task 4.3's goal that tree-first actions be visible and obvious.
- **Recommendation:** Add product-light/product-dark (or codicon `$(...)`) icons to the three tree-scoped command contributions so they render directly on the view title bar.
- **Fix:** Added light and dark SVG command icons for `openSpec`, `refreshSpecTree`, and `revealActiveSpec` so the LiveSpec tree title-bar actions can render directly in the view header.
- **Verification:** All three commands in `package.json` now include `icon` objects with `light` and `dark` SVG paths. All six SVG files exist in `media/`. Fix is correct.

### ✅ Verified - RF9 `LiveSpecTreeDataProvider`'s event emitter is never disposed
- **Severity:** Low
- **Evidence:** [packages/vscode/src/specTree.ts:141-143](packages/vscode/src/specTree.ts#L141-L143) creates `didChangeTreeDataEmitter` but the provider is not pushed onto `context.subscriptions` and exposes no `dispose` method. On extension deactivate the emitter leaks handlers. In practice the extension host tears down with the process, so this is cosmetic, but it diverges from the VS Code disposable idiom already followed elsewhere in the extension.
- **Recommendation:** Implement `dispose()` on the provider (disposing the emitter) and register the provider as a subscription, or dispose the emitter inline via a tracked `Disposable`.
- **Fix:** Implemented `dispose()` on the tree provider and registered the provider itself in `context.subscriptions` so the emitter is disposed with the extension lifecycle.
- **Verification:** `LiveSpecTreeDataProvider.dispose()` calls `this.didChangeTreeDataEmitter.dispose()`. In `activate()`, `this.treeProvider` is pushed onto `context.subscriptions`. Test asserts `extension.context.subscriptions` contains the tree provider. Fix is correct.

### ✅ Verified - RF10 Tests removed the `documentSync`/`extension` coverage for `specFileGlob` without replacement in the core
- **Severity:** Low
- **Evidence:** The repo removed `specFileGlob`-based discovery (spec requires it per [specs/repository-configuration/spec.md:38-46](openspec/changes/add-livespec-tree-view/specs/repository-configuration/spec.md#L38-L46)). `normalizeSpecRootDir` is tested in [packages/core/test/config.test.ts:95-99](packages/core/test/config.test.ts#L95-L99) but only for three inputs. The edge cases `normalizeSpecRootDir` specifically rejects — absolute paths, `..`, `../foo`, non-string values, empty string — have no unit coverage. Given this is the single point that guards against traversal out of the repository, it deserves explicit assertions.
- **Recommendation:** Add a parametrised test for `normalizeSpecRootDir` covering `"/abs/path"`, `".."`, `"../foo"`, `""`, `"   "`, and non-string values, each expected to collapse to `DEFAULT_SPEC_ROOT_DIR`.
- **Fix:** Added parameterized `normalizeSpecRootDir` tests covering absolute paths, parent traversal, empty strings, whitespace-only input, and non-string values, all of which now assert fallback to `DEFAULT_SPEC_ROOT_DIR`.
- **Verification:** `config.test.ts` has a parametrized `it.each` test covering 9 invalid inputs (`"/abs/path"`, `".."`, `"../foo"`, `""`, `"   "`, `42`, `false`, `null`, `{}`) all asserting fallback to `DEFAULT_SPEC_ROOT_DIR`. All 46 tests pass. Fix is correct.

## Questions
- Is it intentional that `specRootDir: "."` (valid per `normalizeSpecRootDir`) causes `matchesLiveSpecFile` to include every markdown file in the repository, including things like `README.md` or `CHANGELOG.md`? If so, the behavior should probably be documented in `specRootDir` notes or guarded by a warning empty state when the tree becomes unexpectedly large.
- design.md:202-206 leaves two open questions unresolved (filename vs H1 labels; preview vs pinned opens). The implementation picks filenames and `preview: true`. Should those decisions be recorded as a follow-up task or acknowledged in design notes before archival?

## Summary
The implementation follows the design well: activity bar view container, shared `LiveSpecSpecIndex`, tree provider with repository/folder/file nodes, quick-pick launcher, tree-title commands, and removal of auto-open are all present with matching tests. The most important gap is RF1 — the new config watcher diverges from the existing editor-change path and never rebroadcasts config to open viewers, which will cause stale `specRootDir` in viewer renders after external config edits. Remaining findings are polish and efficiency items that can be handled as a small follow-up pass.
