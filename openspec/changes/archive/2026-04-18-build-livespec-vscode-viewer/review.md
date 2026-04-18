# Review: build-livespec-vscode-viewer

## Scope

**Reviewed artifacts:** proposal.md, design.md, tasks.md, specs for `markdown-spec-viewer`, `tracked-item-workflow`, `repository-configuration`, `source-navigation-and-sync`

**Reviewed code:**
- `packages/core/src/{config,model,parse,index,browser}.ts`
- `packages/core/test/{config,parse}.test.ts` + fixtures
- `packages/vscode/src/{extension,documentSync,protocol,repository,webviewHtml,constants}.ts`
- `packages/vscode/webview/src/{LiveSpecApp.tsx,bridge.ts,main.tsx,styles.css}`
- `packages/vscode/webview/index.html`, `packages/vscode/package.json`
- `packages/vscode/test/{LiveSpecApp.test.tsx,LiveSpecApp.degraded.test.tsx,documentSync.test.ts,extension.test.ts,repository.test.ts}` + fixtures
- Root workspace config (`package.json`, `tsconfig.*`)

Ran `pnpm --filter @livespec/core test`, `pnpm --filter @livespec/vscode test`, `pnpm --filter @livespec/core typecheck`, and `pnpm --filter @livespec/vscode typecheck` — all 26 tests pass, typecheck clean.

**Verification pass (2026-04-18 02:40):** Reran both test suites and both typechecks after auditing every fix. 9 core tests and 17 vscode tests pass; typecheck remains clean. Each `🟡 Fixed` finding below was verified by inspecting the code change and the new assertion in the named test, and promoted to `✅ Verified`.

## Findings

### ✅ Verified - RF1 Tracked items use `role="button"` with `aria-selected`, which is not a valid ARIA combination
- **Severity:** Medium
- **Evidence:** [packages/vscode/webview/src/LiveSpecApp.tsx:451-453](packages/vscode/webview/src/LiveSpecApp.tsx#L451-L453) sets `role="button"` and `aria-selected={isSelected}` on each tracked item. `aria-selected` is only valid on roles like `option`, `row`, `tab`, `gridcell`, `treeitem` — it has no defined meaning on `button`. Screen readers will either ignore `aria-selected` here or surface conflicting semantics (a button that is "selected" is not the ARIA model of a button). The requirement `tracked-item-workflow: Keyboard selection works on visible items` is about behavior, but assistive tech still needs a coherent role/state model for multi-selection.
- **Recommendation:** Either use a `listbox`/`option` model (wrapping the tracked-item container in a `role="listbox" aria-multiselectable="true"` and the items as `role="option"`), or keep `role="button"` but switch to `aria-pressed` for the toggle state. The former matches the selection behavior better for a multi-select list.
- **Fix:** Switched the tracked-item state to `aria-pressed` and added a webview regression test that asserts the pressed state changes when selection toggles.
- **Verification:** Confirmed [packages/vscode/webview/src/LiveSpecApp.tsx:466-467](packages/vscode/webview/src/LiveSpecApp.tsx#L466-L467) now uses `role="button"` with `aria-pressed={isSelected}`. [packages/vscode/test/LiveSpecApp.test.tsx:117,128](packages/vscode/test/LiveSpecApp.test.tsx#L117-L128) asserts `aria-pressed="false"` pre-toggle and `"true"` after Space. Valid ARIA combination.

### ✅ Verified - RF2 `buildOrderedSelectedIds` returns IDs in document order, but the spec requires selection order
- **Severity:** Low
- **Evidence:** [packages/vscode/webview/src/LiveSpecApp.tsx:82-91](packages/vscode/webview/src/LiveSpecApp.tsx#L82-L91) filters `visibleItems` in their document order and emits IDs in that same order. The requirement `LiveSpec supports copy-selected IDs` — *"copies the selected tracked-item IDs in selection order to the clipboard"* — reads as the order in which items were added to the selection (anchor → latest). The current behavior is predictable but does not match the literal wording of the scenario.
- **Recommendation:** Either (a) update the scenario text in `tracked-item-workflow/spec.md` to "document order" since that is clearly more useful for pasting IDs into checklists, or (b) preserve the insertion order in `selectedKeys`/`selectedIds` and emit IDs in that order. Pick one and make the test assertion match. Right now, there is no test asserting either order explicitly.
- **Fix:** Preserved selection order by deriving copied IDs from `selectedKeys` instead of visible document order, including reverse range selections, and added an explicit copy-order test.
- **Verification:** Confirmed [packages/vscode/webview/src/LiveSpecApp.tsx:82-95](packages/vscode/webview/src/LiveSpecApp.tsx#L82-L95) iterates `selectedKeys` (not document order) to produce IDs, and [packages/vscode/webview/src/LiveSpecApp.tsx:357-360](packages/vscode/webview/src/LiveSpecApp.tsx#L357-L360) reverses range keys when the shift-click target is above the anchor. [packages/vscode/test/LiveSpecApp.test.tsx:162-205](packages/vscode/test/LiveSpecApp.test.tsx#L162-L205) clicks REQ-1, Ctrl-clicks REQ-3, Ctrl-clicks REQ-2, and asserts the `copySelectedIds` payload is `["REQ-1", "REQ-3", "REQ-2"]` — selection order, not document order.

### ✅ Verified - RF3 No test exercises the `maybeAutoOpen` flow that implements the "Matching file opens in LiveSpec" scenarios
- **Severity:** Medium
- **Evidence:** [packages/vscode/src/extension.ts:197-235](packages/vscode/src/extension.ts#L197-L235) contains non-trivial logic: glob matching, guarding against loops, `onDidOpenTextDocument` vs `onDidChangeVisibleTextEditors` handling, config-change triggered rematching, and `autoOpenedUris` lifecycle. The only related tests are [packages/vscode/test/repository.test.ts](packages/vscode/test/repository.test.ts) (tests `matchesLiveSpecFile` and `findRepositoryRoot` in isolation). Task 5.3 explicitly says *"Add integration coverage for matching-file open behavior, `Edit Source`, and webview refresh from document updates"*. The matching predicate is covered but not the auto-open decision logic or the non-matching skip path.
- **Recommendation:** Add a unit-level test that exercises `maybeAutoOpen` behavior — e.g. factor the "should auto-open this document?" decision into a pure function (inputs: document URI/languageId/scheme, config path detection, hasOpenPanel, autoOpenedUris, config, repositoryRoot) and assert: matching path auto-opens, non-matching markdown skips, already-open panel skips, config file skips, non-file scheme skips, second invocation on the same URI skips.
- **Fix:** Added `packages/vscode/test/extension.test.ts` coverage for matching-file auto-open, non-matching skips, config-file skips, already-open panel skips, and repeat-open guards.
- **Verification:** [packages/vscode/test/extension.test.ts:140-247](packages/vscode/test/extension.test.ts#L140-L247) calls `maybeAutoOpen` directly and asserts: matching spec file invokes `vscode.openWith` with `LIVE_SPEC_VIEW_TYPE`, repeat calls on the same URI execute only once (`autoOpenedUris` guard), `untitled` scheme skips repository lookup, `.livespec/config.json` skips repository lookup, non-matching markdown resolves but skips `openWith`, and a pre-existing open panel skips both lookup and `openWith`. All 6 cases pass.

### ✅ Verified - RF4 No host-side test for `openSource` / Edit Source; webview test only asserts the outgoing message
- **Severity:** Low
- **Evidence:** Task 5.3 calls for integration coverage of `Edit Source`. [packages/vscode/test/LiveSpecApp.test.tsx:109-117](packages/vscode/test/LiveSpecApp.test.tsx#L109-L117) asserts that the webview posts `{ type: "editSource", line: 3 }`, but the host-side handler in [packages/vscode/src/extension.ts:163-165](packages/vscode/src/extension.ts#L163-L165) and [packages/vscode/src/extension.ts:248-264](packages/vscode/src/extension.ts#L248-L264) — which computes `Math.max(0, line - 1)`, resolves the view column, and sets the selection/reveal — is not tested. If the off-by-one or viewColumn logic regresses, nothing would catch it.
- **Recommendation:** Add a lightweight test with a fake `vscode.window.showTextDocument` (similar pattern to `documentSync.test.ts`) that verifies `openSource` converts line=1 to position.line=0, line=5 to position.line=4, and passes the panel's viewColumn through.
- **Fix:** Added host-side Edit Source coverage with a mocked `showTextDocument` that verifies one-based line conversion, selection/reveal placement, and forwarded `viewColumn`.
- **Verification:** [packages/vscode/test/extension.test.ts:249-309](packages/vscode/test/extension.test.ts#L249-L309) calls `openSource` with `(doc, 1, 3)` and asserts `showTextDocument` receives `viewColumn: 3`, selection anchor line is `0`, and `revealRange` targets line `0`. Then calls `(doc, 5, undefined)` and asserts the second call has no `viewColumn` key and selection anchor line is `4`. Off-by-one and viewColumn forwarding are now pinned.

### ✅ Verified - RF5 Several tracked-item-workflow scenarios lack test coverage
- **Severity:** Low
- **Evidence:** [packages/vscode/test/LiveSpecApp.test.tsx](packages/vscode/test/LiveSpecApp.test.tsx) covers Space-to-toggle, theme changes, and filtered-empty state. It does not cover:
  - `Ctrl/Cmd+A selects all currently visible items` ([LiveSpecApp.tsx:375-385](packages/vscode/webview/src/LiveSpecApp.tsx#L375-L385))
  - `Escape clears selection` ([LiveSpecApp.tsx:387-390](packages/vscode/webview/src/LiveSpecApp.tsx#L387-L390))
  - `Shift-click selects a visible range` ([LiveSpecApp.tsx:340-347](packages/vscode/webview/src/LiveSpecApp.tsx#L340-L347))
  - `Hidden items are removed from selection` when the incomplete-only filter is enabled ([LiveSpecApp.tsx:212-231](packages/vscode/webview/src/LiveSpecApp.tsx#L212-L231))
  - `Copy action with no selection` (should be a no-op)
- **Recommendation:** Extend `LiveSpecApp.test.tsx` with cases for each scenario above. The shift-click and filtering cases in particular are the most likely regression spots.
- **Fix:** Expanded `LiveSpecApp.test.tsx` to cover Ctrl/Cmd+A, Escape, Shift-click ranges, filter-pruned selection, no-op copy requests, and explicit selection-order copying.
- **Verification:** All five previously uncovered scenarios now have explicit assertions: Ctrl+A ([LiveSpecApp.test.tsx:216-223](packages/vscode/test/LiveSpecApp.test.tsx#L216-L223)), Escape ([LiveSpecApp.test.tsx:225-232](packages/vscode/test/LiveSpecApp.test.tsx#L225-L232)), Shift-click range ([LiveSpecApp.test.tsx:235-259](packages/vscode/test/LiveSpecApp.test.tsx#L235-L259)), incomplete-only filter drops hidden selections ([LiveSpecApp.test.tsx:261-286](packages/vscode/test/LiveSpecApp.test.tsx#L261-L286) — selecting all three items then enabling the filter leaves only `["REQ-1", "REQ-3"]`), and no-op copy when nothing is selected ([LiveSpecApp.test.tsx:288-300](packages/vscode/test/LiveSpecApp.test.tsx#L288-L300)).

### ✅ Verified - RF6 `selectionAnchorKey` is overwritten by `onFocus`, breaking the shift-click anchor when tabbing
- **Severity:** Low
- **Evidence:** [packages/vscode/webview/src/LiveSpecApp.tsx:454-456](packages/vscode/webview/src/LiveSpecApp.tsx#L454-L456) sets `setSelectionAnchorKey(item.runtimeKey)` in `onFocus` for every item. Because tracked items are natively tabbable (`tabIndex={0}`), pressing Tab changes focus, which immediately updates the anchor. If a user clicks item A, tabs to item C, then Shift-clicks item E, the range is C→E rather than A→E (the clicked anchor). This does not match the intent of Shift-click range selection, where the anchor should be the last explicitly selected item.
- **Recommendation:** Only update `selectionAnchorKey` in the selection handlers (click/Space/select-all), not on `onFocus`. If focus needs to track visually, use a separate `focusedKey` state that does not influence the shift-click anchor.
- **Fix:** Removed the focus-driven anchor mutation so only explicit selection actions set `selectionAnchorKey`, and added a regression test for tab/focus followed by Shift-click.
- **Verification:** The tracked-item `<div>` in [packages/vscode/webview/src/LiveSpecApp.tsx:452-477](packages/vscode/webview/src/LiveSpecApp.tsx#L452-L477) no longer has an `onFocus` handler; `selectionAnchorKey` is only set by `updateSelection` (click/Space/Ctrl+A) and the filter-pruning effect. [packages/vscode/test/LiveSpecApp.test.tsx:235-259](packages/vscode/test/LiveSpecApp.test.tsx#L235-L259) clicks REQ-1 (anchor=REQ-1), focuses REQ-2, then Shift-clicks REQ-3 and asserts the range is `["REQ-1", "REQ-2", "REQ-3"]` — which only passes if focus did not overwrite the anchor.

### 🔴 Open - RF7 First-time "Open With... Text Editor" on a matching file is overridden by auto-open
- **Severity:** Low
- **Evidence:** [packages/vscode/src/extension.ts:112-114](packages/vscode/src/extension.ts#L112-L114) triggers `maybeAutoOpen` on `onDidOpenTextDocument`. When a user explicitly picks "Open With... → Text Editor" for a never-before-opened matching markdown file, VS Code fires `onDidOpenTextDocument` before the user's intent is settled, and the extension calls `vscode.openWith(..., LIVE_SPEC_VIEW_TYPE)`, which overrides the user's explicit text-editor choice. The `autoOpenedUris` guard only protects *subsequent* opens after the first auto-open has happened. Design risk #1 calls for "preserve easy escape via Open With...", which works after the first time but not on the first attempt.
- **Recommendation:** Either (a) skip auto-open when the file was opened with an explicit non-default editor — check the active text editor's viewColumn or detect that `openWith` would be "unsolicited", (b) gate the `onDidOpenTextDocument` path on a visibility signal, or (c) accept this and note it as an open-question follow-up (the design's open question #3 about a one-time prompt covers this).
- **Status:** Left open. I did not make a behavior change here because VS Code does not expose a high-confidence signal in this codepath for "explicit Open With... Text Editor" versus an ordinary text-editor open, and guessing would risk regressing the matching-file auto-open behavior the spec already requires.

### ✅ Verified - RF8 `parseLiveSpecDocument` degraded-state branch has no test and is effectively unreachable
- **Severity:** Low
- **Evidence:** [packages/core/src/parse.ts:183-195](packages/core/src/parse.ts#L183-L195) returns `{ ok: false, ... }` on exception. `unified`/`remark-parse` is very tolerant and will not throw on arbitrary markdown input. Meanwhile, the webview UI renders an entire "Unable to render this document" state ([LiveSpecApp.tsx:547-559](packages/vscode/webview/src/LiveSpecApp.tsx#L547-L559)) that nothing in the test suite or code path covers. The scenario `Parsing fallback state` in `markdown-spec-viewer/spec.md` is claimed-done but not exercised.
- **Recommendation:** Either add a test that mocks `parseMarkdownToAst` to throw and asserts the degraded UI renders, or, if the project wants to verify real behavior, add a second failure trigger in the pipeline (e.g. schema validation of the extracted tracked items) that can fail for adversarial input. At minimum, a unit test of `parseLiveSpecDocument` with an injected throwing dependency would confirm the branch compiles and behaves.
- **Fix:** Added injected-parser coverage for `parseLiveSpecDocument` and a degraded-state webview test that renders the fallback UI and verifies its Edit Source action.
- **Verification:** [packages/core/src/parse.ts:171-199](packages/core/src/parse.ts#L171-L199) now accepts an optional `parseMarkdownToAst` dependency; [packages/core/test/parse.test.ts:60-81](packages/core/test/parse.test.ts#L60-L81) injects a thrower and asserts `result.ok === false` with the empty-progress degraded document. [packages/vscode/test/LiveSpecApp.degraded.test.tsx:78-121](packages/vscode/test/LiveSpecApp.degraded.test.tsx#L78-L121) mocks `@livespec/core/browser` to return a failing parse result, asserts the "Unable to render this document" heading and error message render, and asserts clicking the fallback Edit Source button posts `{ type: "editSource", line: 1 }`.

## Questions

- Is overriding the user's explicit "Open With... Text Editor" on the first open acceptable given the design's stated "easy escape" goal? (see RF7)

## Summary

The implementation closely follows the design and covers all 20 tasks. Core parsing, config validation, panel registry debouncing, webview bridge, and theme integration are clean and match the specs. The targeted package test suites now cover the previously untested auto-open, Edit Source, degraded parsing, and tracked-item interaction paths, and all tests pass with typecheck green.

The only remaining open issue is RF7: the first-time `Open With... Text Editor` flow can still be overridden by matching-file auto-open. I left that behavior untouched because the current extension code does not have a reliable signal to distinguish explicit text-editor intent from a normal open without risking regressions in the required auto-open path.

**Verification outcome (2026-04-18 02:40):** All seven `🟡 Fixed` findings (RF1, RF2, RF3, RF4, RF5, RF6, RF8) are promoted to `✅ Verified`. RF7 remains `🔴 Open`. No new findings surfaced during verification.
