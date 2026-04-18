# LiveSpec Plan

This document is the current single source of truth for the LiveSpec plan. It supersedes earlier design drafts for this viewer.

## Summary

LiveSpec is a VS Code-first, markdown-first spec viewer for understanding an app as it exists today.

The emphasis is not "future intended behavior." The emphasis is "current implemented reality": architecture, UI, technology choices, tracked work items, and other spec-adjacent facts that help a human verify correctness.

Version 1 should stay narrow:

- Single file viewer only
- No single-file outline
- No collapsible section chrome
- Strong markdown rendering
- Selectable tracked items
- Progress and filtering
- Reliable `Edit Source` navigation back to the `.md` file

Markdown remains the canonical authored format. Future "live" content should be additive and fetched on demand, not a replacement for markdown.

## Product Direction

- Keep the concept as `LiveSpec` everywhere: docs, package names, command IDs, CSS variables, view types, and internal types.
- Keep the product centered on "spec as implemented today."
- Treat future dynamic views as embedded, on-demand augmentations inside markdown, not as a separate mode.
- Keep the initial experience intentionally simple: one file, one preview, one interaction model.

## V1 Scope

### In

- VS Code custom text editor for spec markdown files
- Render markdown with good defaults and VS Code theme integration
- Detect tracked checklist items with stable IDs
- Multi-select tracked items and copy selected IDs
- Show overall progress summary
- Toggle "incomplete only"
- Provide an `Edit Source` action that opens the spec markdown at the relevant line
- Refresh automatically when the document changes

### Out

- Single-file outline view
- Document section collapse / expand UI
- Whole-specs-directory outline
- In-place markdown editing or WYSIWYG editing in V1
- Arbitrary embedded JS / JSX in markdown
- General plugin system

If directory-level navigation is added later, it should be a separate VS Code `TreeView` or explorer contribution, not an in-webview outline sidebar.

## Core Product Decisions

### 1. Position the product as LiveSpec

`LiveSpec` better matches the long-term product:

- Markdown is still first-class
- Some content will eventually be fetched on demand
- The viewer should help the human understand the current app, not a speculative future plan

### 2. Remove the outline from V1 entirely

The outline adds UI weight without being required for the core value. Removing it simplifies:

- Layout
- Keyboard model
- Scroll syncing
- Heading extraction logic
- State management

The right simplification for V1 is a clean single-column preview with a compact top toolbar.

### 3. Keep reuse in `core`, not a standalone renderer package

Do not split the product around a standalone renderer package yet.

The reusable part is the markdown parsing and document-model logic, not the whole UI shell. A better split is:

```text
livespec/
├── packages/
│   ├── core/          # @livespec/core
│   │   ├── parse/
│   │   ├── model/
│   └── vscode/        # @livespec/vscode
│       ├── src/       # extension host
│       └── webview/   # React UI bundle
└── package.json
```

This keeps future reuse possible without prematurely hardening a generic renderer API before a second host exists.

## Editor Architecture

Use a `CustomTextEditorProvider`, not a full custom editor with its own document model.

Reasons:

- The source files are text.
- VS Code already knows how to manage `TextDocument`, save, hot exit, and undo/redo.
- The official custom editor guidance explicitly positions `CustomTextEditorProvider` as the simpler and better fit for text-based formats.

Implementation notes:

- Activate when a workspace contains a `specs/` directory or when a matching spec file is opened directly.
- Register LiveSpec as the default editor for the configured spec-file glob, not for arbitrary markdown.
- Default the spec-file glob to `**/specs/**/*.md`.
- Allow the spec-file glob to be overridden per repository in `.livespec/config.json`.
- Files matching the glob should still open in LiveSpec even when they contain zero tracked items.
- Support multiple editors per document from the start.
- Sync from `workspace.onDidChangeTextDocument` instead of adding a separate file watcher. That already covers normal edits, undo/redo, and external changes flowing into the `TextDocument`.
- Debounce reparsing and rerendering by about 200 ms so the document body and progress summary update from the same parsed snapshot.
- Persist lightweight webview state with `getState` / `setState`, not `retainContextWhenHidden`.
- Users should still be able to switch to the normal text editor via VS Code's `Open With...` flow.

### Webview State

Persist only lightweight, semantic state:

- Selected tracked-item IDs
- Incomplete-only toggle
- Scroll restore anchor based on the first visible tracked item, with nearest source line as fallback

Do not persist raw pixel scroll offsets. They are too fragile when the document changes between hide and reveal.

### Commands

- `livespec.copySelectedIds`
- `livespec.toggleIncompleteOnly`
- `livespec.editSource`
- `livespec.refresh`

The user-facing label for source navigation should be `Edit Source`. That action means "open the underlying spec `.md` file in the normal text editor at the mapped source line."

### Host / Webview Messages

Keep message passing narrow, JSON-only, and represented as TypeScript discriminated unions.

Host -> webview messages:

- `documentUpdated({ text, version })`
- `themeChanged`
- `configChanged`

Webview -> host messages:

- `copySelectedIds({ ids })`
- `editSource({ line })`
- `selectionChanged({ ids })`
- `ready`

## Repository Configuration

LiveSpec should support repository-specific configuration in `.livespec/config.json`.

This file is the canonical place for repo-level LiveSpec behavior that can vary between codebases, such as:

- Spec file locations
- Tracked-item ID format
- Other repo-specific parsing or discovery rules that should be shared by everyone working in the repository

Configuration rules:

- The config file should live at `.livespec/config.json` in the repository root
- The default spec-file glob is `**/specs/**/*.md`
- Repositories may override that default glob in `.livespec/config.json`
- The config file should be checked into version control
- The format should be JSON with schema validation and a top-level `version` field
- VS Code-specific settings may still exist as editor-local overrides, but `.livespec/config.json` is the canonical repo contract

## Markdown Stack Recommendation

### Recommendation

Keep the `unified` / `remark` ecosystem.

Recommended stack:

- `unified`
- `remark-parse`
- `remark-gfm`
- `remark-directive` when live blocks land
- custom `remark-livespec-*` plugins
- `react-markdown` in the webview render layer

### Why this is the best fit

- `unified` / `remark` is AST-first, which matters here because LiveSpec needs metadata, positions, transforms, and future dynamic block descriptors.
- `unist` nodes carry positional data, which makes `Edit Source` line mapping straightforward and reliable.
- `react-markdown` is a thin React wrapper around the same `remark` -> `rehype` pipeline, but with less glue code than wiring `rehype-react` directly in V1.
- `remark-directive` gives us an extension syntax for future live blocks without moving to MDX.
- `react-markdown` is safe by default and does not rely on `dangerouslySetInnerHTML`, which is a good property for a VS Code webview.

For V1, it is acceptable for `@livespec/core` to own metadata extraction while `react-markdown` owns the render pass. These documents should be small enough that simplicity is more important than forcing a single-pass pipeline on day one.

### Specific recommendation on "remark vs something else"

`remark` is still the right foundational choice here, but I would be precise about what that means:

- Use `unified()` with `remark-parse` and related plugins rather than the top-level `remark()` convenience package
- Use `react-markdown` for the webview rendering surface unless we later prove we need a fully manual single-pass render pipeline

That keeps the ecosystem choice while simplifying the implementation.

### Alternatives considered

#### `markdown-it` / built-in VS Code markdown preview

This is the main alternative worth considering.

Pros:

- VS Code's markdown preview already uses `markdown-it`
- VS Code exposes markdown preview extensions through `markdown-it` plugins and preview scripts
- `markdown-it` tokens include line maps and plugin metadata hooks

Why I would still not choose it as the primary foundation:

- LiveSpec needs a more opinionated interaction model than "extend the built-in preview"
- Future live blocks fit an AST-first model better than a token-to-HTML model
- A dedicated custom editor is a better fit for selection, progress, filtering, and source actions than trying to piggyback on the built-in markdown preview

If the goal were "slightly enhanced markdown preview," I would revisit this. For LiveSpec, I would not.

#### MDX

Not recommended.

MDX is useful when authors need to write JSX inside content. That is not the product goal here. LiveSpec should support trusted, typed live blocks fetched by the extension, not arbitrary code embedded in docs.

#### Direct `rehype-react`

Viable, but I would not start there.

If we later want a fully manual single-pass pipeline, `rehype-react` is a reasonable escalation path. For V1, `react-markdown` is the more pragmatic choice.

## Document Model

`@livespec/core` should parse markdown into a typed model that the rest of the app can depend on.

Example shape:

```ts
interface LiveSpecDocument {
  sourceUri: string
  trackedItems: LiveSpecTrackedItem[]
  progress: {
    total: number
    complete: number
    remaining: number
  }
  liveBlocks: LiveSpecBlockDescriptor[]
}

interface LiveSpecTrackedItem {
  id: string
  completed: boolean
  line: number
  labelText: string
}
```

The important point is not the exact type names. The important point is to make tracked items and future live blocks first-class data, not incidental UI behavior.

## Tracked Item Detection

Do not rely on raw line regex matching alone.

I would tighten that up:

- Parse GFM task list items through `remark-gfm`
- Only treat checklist items as tracked items when the first text token begins with an ID
- Use the AST node position for line numbers
- Leave non-matching task list items as normal markdown

That is more robust than scanning raw lines because it works with real markdown structure instead of string heuristics alone.

For V1, keep the existing ID shape unless we learn otherwise:

- `T001`
- `SC-001`
- `REQ-42`

The parser should stay isolated so broadening the pattern later is cheap.

Parser contract for V1:

- ID matching is case-sensitive
- Leading inline whitespace before the first meaningful token is ignored
- A leading ID may be wrapped in bold or italic markup and still count
- A leading ID inside inline code does not count
- A valid ID must be followed by end-of-text or a non-word separator such as whitespace or `:`

## UI Plan

### Layout

Use a simple two-part layout:

1. Compact sticky toolbar
2. Scrollable document body

Toolbar contents:

- File name
- Progress summary, for example `8/15 complete`
- Incomplete-only toggle
- Selection count when relevant
- `Copy IDs`
- `Refresh`

### Rendering behavior

- Render the markdown as normal prose first
- Enhance tracked items with selection affordances and ID badges
- Do not add outline chrome, section collapse, or scroll spy behavior

### Selection behavior

- Click: select one item
- Ctrl/Cmd+Click: toggle one item
- Shift+Click: range select
- Tab / Shift+Tab: move keyboard focus across visible tracked items
- Space: toggle the focused item in selection
- Ctrl/Cmd+A: select all currently visible tracked items
- Escape: clear selection
- Every tracked item must be keyboard focusable
- Hidden items are automatically removed from selection when the incomplete-only filter is applied

### Progress behavior

Show progress against the whole document, not only the currently visible filtered subset.

That makes the summary stable and meaningful. If the filter is active, the UI can still show a remaining count without redefining total progress.

### Edit Source

`Edit Source` is the user-facing name for source navigation back to the authored spec markdown.

The action should open the underlying `.md` file in VS Code's normal text editor at the relevant source line for the current tracked item or selection.

Do not make `Edit Source` a right-click-only affordance.

Preferred V1 behavior:

- Inline action on focused or hovered tracked items
- Toolbar action for the current selection
- Command palette command as backup

This is more discoverable than hiding the feature behind a custom context menu.

### Empty and degraded states

- Documents with zero tracked items should be treated as a normal common case, not an empty or degraded state
- When there are zero tracked items, render the markdown normally and do not add special "No tracked items" messaging or chrome
- If the document is empty, show an explicit empty-document state
- If the incomplete-only filter hides every tracked item, show a filtered-empty state while keeping whole-document progress unchanged
- If tracked-item extraction or parsing fails, show a clear degraded state with source fallback instead of blanking the document

## Future Live Blocks

This is where the "Live" part of LiveSpec starts to matter.

The plan should keep two concerns separate:

- Surface syntax: how a live block is authored in markdown
- Resolution contract: how the extension host resolves and returns typed data for that block

### Surface syntax options

#### Option A: Directives

Directives are a good fit for lightweight declarative live blocks, for example:

```md
:::livespec-view{kind="architecture"}
:::
```

or:

```md
:::livespec-view{kind="ui-components" scope="frontend"}
:::
```

This option works well when the block is mostly "please render this known view with these typed attributes."

#### Option B: Fenced blocks with a dedicated embedded language

This is the option I would be more likely to add first.

Example:

~~~~md
```livespec
<AppArchitecture root="src/app" focus="services" />
```
~~~~

or, when metadata is useful, a directive plus a fenced block:

~~~~md
:::livespec-view{engine="livespec" title="Current backend architecture"}
```livespec
<AppArchitecture root="src/app" focus="services" />
```
:::
~~~~

This option is attractive because:

- fenced code blocks are already a natural markdown escape hatch for foreign languages
- the raw embedded source remains visible and useful as a fallback
- LiveSpec can render `livespec` blocks as previews without making the whole document format MDX-like
- the embedded language can grow richer over time without forcing markdown itself to become a programming language

For now, the plan should assume that future live content may use either directives or fenced blocks, with fenced `livespec` blocks being the more likely primary path.

### Resolution contract

Regardless of which surface syntax wins, the host-side resolution contract is the load-bearing design and should stay stable.

Resolution rules:

- Markdown stays readable even if a block cannot be resolved
- The extension host, not the webview, resolves live block data
- Providers return typed JSON view models, not raw HTML
- Blocks load on demand
- Each block has loading, empty, error, and refreshed states
- Cache results per document session, with explicit refresh

Additional guidance:

- Prefer directives when the embedded content is a simple typed request
- Prefer fenced `livespec` blocks when the embedded content needs a richer DSL
- Always preserve a useful source fallback when preview rendering fails
- Avoid moving to MDX unless the product truly needs arbitrary JSX and JavaScript in documents

This gives LiveSpec a clean path to architecture views, component inventories, dependency summaries, and other "current-state" diagnostics while keeping markdown as the primary authoring format.

## Future Edit-On-Demand

Inline or popup editing is a possible future addition, but it should not be part of V1.

The right model is preview-first and edit-on-demand:

- The default experience remains read-only rendered markdown
- Editing is invoked explicitly for a focused block or small source region
- The edit UI may be a small WYSIWYG popup, anchored editor, or side sheet rather than full-document edit mode

Design rules:

- Markdown remains the only canonical stored format
- Rich editing should be limited to common markdown structures such as paragraphs, headings, emphasis, links, lists, and task items
- Unsupported or awkward constructs such as code fences, tables, directives, and custom syntax should fall back to raw markdown editing
- Saving an edit should serialize back to markdown, patch the source text, and then reparse the document
- Source-range mapping must stay precise enough to support block-scoped editing and patch application

Architecturally, this future feature should preserve the same host split as the rest of LiveSpec:

- Shared document logic owns parsing, source mapping, and markdown serialization rules
- The host owns file updates, persistence, and any editor chrome
- The rendered preview remains the primary mode, with editing treated as an exceptional action rather than the default interaction model

## Webview Security And VS Code Integration

Because this is a webview-based editor, security and platform fit should be part of the initial plan, not cleanup work.

- Set a restrictive content security policy
- Keep scripts and styles in external bundled files
- Restrict `localResourceRoots`
- Sanitize any workspace-derived content that becomes HTML
- Use VS Code theme CSS variables from the first webview commit
- Smoke-test light, dark, and high-contrast themes from Phase 1 onward
- Keep message passing narrow and JSON-only

LiveSpec clearly justifies a webview, but it should still follow normal VS Code webview discipline.

## Implementation Phases

### Phase 1: Foundation

- Rename the concept and package surface to LiveSpec
- Scaffold the workspace
- Create `@livespec/core`
- Create the VS Code extension shell and webview bundle
- Establish VS Code theme tokens and baseline light / dark / high-contrast support
- Register the custom text editor and commands

### Phase 2: Markdown And Tracked Items

- Parse markdown with `remark-gfm`
- Build tracked item extraction
- Render markdown in the webview
- Add selection state, copy IDs, progress summary, and incomplete-only filtering
- Lock down tracked-item edge cases with markdown fixture tests

### Phase 3: Editor Integration

- Wire `onDidChangeTextDocument`
- Add debounced document refresh
- Implement `Edit Source` navigation
- Preserve lightweight state across hides / reveals
- Handle split editors cleanly

### Phase 4: Polish

- Accessibility and keyboard polish
- Error states
- Performance checks on larger docs
- Test coverage

### Phase 5: Live Blocks

- Add support for future live blocks
- Support `livespec` fenced blocks or equivalent embedded-language blocks
- Optionally add `remark-directive` for declarative block syntax
- Define block descriptor schema
- Add extension-host provider interface
- Implement first live block types

## Testing Plan

- Unit tests for tracked-item parsing, ID extraction, and line mapping
- Unit tests for tracked-item edge cases such as whitespace, emphasis, code spans, separators, and case sensitivity
- Unit tests for live block descriptor extraction
- Component tests for selection, filtering, and progress UI
- Component tests for empty and degraded states
- VS Code integration tests for editor registration, document refresh, and `Edit Source` navigation

Use markdown fixture files heavily. The parser behavior is important enough to lock down with real examples.

## Plan Summary

The current plan is:

- Reframe the product as `LiveSpec`
- Remove the single-file outline completely
- Replace the renderer-package-first architecture with a smaller reusable `core` package plus a VS Code host
- Keep `unified` / `remark` as the foundation
- Prefer `react-markdown` over a hand-wired `rehype-react` render pipeline for V1
- Use `Edit Source` as the user-facing name for returning from the rendered view to the authored markdown at the mapped line
- Prefer fenced `livespec` blocks or similarly explicit embedded-language blocks for richer future live content; directives remain a good lighter-weight option
- Treat any future rich editing as edit-on-demand and markdown-backed, not as full-document WYSIWYG mode

That gives you a simpler V1 and a cleaner path to the future "live current-state views" idea.

## References

- [VS Code Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors)
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code Markdown Extension Guide](https://code.visualstudio.com/api/extension-guides/markdown-extension)
- [unified guide](https://unifiedjs.com/learn/guide/using-unified/)
- [remark package docs](https://unifiedjs.com/explore/package/remark/)
- [react-markdown](https://github.com/remarkjs/react-markdown)
- [remark-directive](https://github.com/remarkjs/remark-directive)
- [markdown-it docs](https://markdown-it.github.io/markdown-it/)
- [unist specification](https://github.com/syntax-tree/unist)
