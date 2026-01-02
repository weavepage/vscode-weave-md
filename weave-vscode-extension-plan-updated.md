# Weave VS Code Extension Plan
*A spec-compliant preview renderer + validator UX + navigation helpers (not a full product reader/editor).*

## Goals
- Make Weave feel like a **real format** in a developer workflow.
- Provide a **reliable preview** of expandable `node:` references inside VS Code’s **built-in Markdown preview UI**.
- Provide **first-class diagnostics** (Problems panel) for invalid Weave documents.
- Provide **navigation helpers** (go-to-definition, quick peek) for referenced sections.

---

## High-level architecture

### Two-layer approach

**1. Validation Layer (Hybrid Approach)**
- **Real-time Validation**: Uses `@weave-md/validate` for fast, lightweight validation as user types
- **Full AST Validation**: Uses `@weave-md/parse` for comprehensive conformance checking on demand
- Generates conformance-compliant diagnostics and builds workspace graph for navigation
- Runs in background for validation, not preview rendering

#### Validation Components
1. **Lightweight Validator (Always On)**
   - Wraps `@weave-md/validate` functions for real-time feedback
   - Fast syntax and structure validation
   - Immediate error reporting in Problems panel
   - Extracts sections and links for graph building

2. **Full AST Validator (On-Demand)**
   - Uses `@weave-md/parse` for deep validation with full AST generation
   - Comprehensive conformance checking and edge case detection
   - Available via command or automatic triggers

**2. Preview Layer (built-in Markdown preview + markdown-it extension + injected scripts/styles)**
- Extends VS Code's existing markdown-it pipeline via `extendMarkdownIt`
- Uses VS Code’s native Markdown preview UI (no custom reader webview)
- Handles preview rendering and interactivity:
  - Transforms `node:` links and Weave format blocks during rendering
  - Pre-embeds expansion/overlay/note bodies at render time (depth + size limited)
- Injects JavaScript/CSS into the built-in preview for expand/collapse, overlays, numbering

---

## Components

### Validation Layer (extension host, TypeScript)
1. **Lightweight Validator**
   - Wraps `@weave-md/validate` functions for real-time validation
   - Runs on file changes for immediate diagnostics (debounced; active file on keystroke)
   - Extracts sections and links for graph building
   - Builds/updates workspace indices (recommended: per-file indices to support incremental correctness)

2. **Full AST Validator**
   - Uses `@weave-md/parse` for comprehensive validation with full AST generation
   - Available via command or automatic triggers (save, periodic)
   - Provides deep conformance checking and edge case detection
   - Updates indices/graph with additional validation results

3. **Diagnostics Provider**
   - Presents validation errors/warnings in Problems panel
   - Missing target IDs, duplicate IDs, invalid frontmatter
   - Invalid `node:` URL syntax and parameters
   - Weave format block validation errors
   - Distinguishes between lightweight and full validation results (codes + severity)

4. **Navigation Features**
   - "Go to Weave Section Definition" (open section file at frontmatter)
   - "Peek Weave Section" (show peek text or excerpt)
   - "Show Backlinks" command (1-hop incoming refs)

### Preview Layer (built-in preview + markdown-it)
5. **Markdown-it Plugin**
   - Extends VS Code's markdown-it renderer via `extendMarkdownIt`
   - Transforms `node:` links to interactive elements
   - Renders Weave format blocks (math, media, etc.)
   - Preserves VS Code's native preview performance
   - **Does not do workspace indexing or deep validation**; it consumes host-owned shared state

6. **Preview Enhancement Scripts + Styles**
   - Contributed via:
     - `contributes.markdown.previewScripts`
     - `contributes.markdown.previewStyles`
   - Injects JavaScript for expand/collapse behavior and overlays
   - Manages numbering for footnotes/sidenotes/margin notes
   - Provides cycle-safe UX affordances
   - **No runtime fetch/RPC**: scripts only manipulate DOM (content is pre-embedded during render)

---

## Dependencies (recommended)

### Validation Layer Dependencies
- **`@weave-md/validate`** (npm): Fast, lightweight validation for real-time feedback
- **`@weave-md/parse`** (npm): AST generation for comprehensive parsing and deep validation
- **`@weave-md/core`** (npm): types + `node:` URL parsing/format helpers + parameter enums + spec version v0.1.0-alpha.0
- YAML frontmatter parser: `yaml` (small, stable)

### Preview Layer Dependencies
- **VS Code's built-in markdown-it**: Core renderer for preview (no installation needed)
- **markdown-it plugins**: Custom plugins for Weave format extensions
- **`katex`** (npm): Math rendering for block and inline math elements (bundle locally)
- Media rendering: HTML5 audio/video elements for media blocks (safe subset)

### Shared Utilities
- Debouncing utilities for file watching
- URI utilities for file path handling

---

## Repo structure
Recommended public repo: `weavepage/vscode-weave-md`

```
vscode-weave-md/
  package.json
  tsconfig.json
  src/
    extension.ts                 # activation, registrations
    validation/
      lightweightValidator.ts    # @weave-md/validate wrapper for real-time validation
      fullAstValidator.ts        # @weave-md/parse wrapper for comprehensive validation
      diagnosticsProvider.ts     # Problems panel integration
      quickFix.ts                # CodeActions
      indexStore.ts              # per-file indices + derived global views (recommended)
    preview/
      markdownItPlugin.ts        # markdown-it plugin hook (extendMarkdownIt)
      nodeLinkPlugin.ts          # node: link processing (render-time embedding)
      weaveFormatPlugin.ts       # Weave format blocks (math/media/etc.)
      previewAssets.ts           # wires previewScripts/previewStyles contributions
      client/
        weavePreview.js          # DOM toggles/overlays/numbering (no RPC)
        weavePreview.css         # minimal styling that inherits theme
    commands/
      gotoDefinition.ts
      peekSection.ts
      showBacklinks.ts
    languageFeatures/
      completionProvider.ts      # autocomplete for node: links, frontmatter
      hoverProvider.ts           # section preview on hover
      definitionProvider.ts      # go to section definition
    util/
      debounce.ts
      uri.ts
  test/
    fixtures/
    validation/
      lightweightValidator.test.ts
      fullAstValidator.test.ts
      diagnostics.test.ts
    preview/
      markdownItPlugin.test.ts
    languageFeatures/
      completionProvider.test.ts
      hoverProvider.test.ts
  README.md
  LICENSE
```

**Notes**
- Removed `communication/layerBridge.ts` and “webview message” assumptions. Shared state lives in the extension host and is read synchronously during markdown-it render.
- Renamed `webviewAssets.ts` → `previewAssets.ts` to reflect “built-in preview scripts/styles” rather than a custom webview.

---

## Extension Activation & Performance

### Activation Strategy
- **Lazy activation**: Only activate when opening Weave documents (detected by frontmatter or file patterns)
- **Activation events**: `onLanguage:markdown` + workspace file pattern detection
- **Selective indexing**: Only parse files matching `weave.rootFile` and `weave.sectionsGlob` patterns
- **Background processing**: Initial indexing runs in background without blocking UI

### Performance Constraints
- **Startup impact**: < 100ms activation time for non-Weave markdown files
- **Indexing throttling**: Process files in batches with `setTimeout` delays to prevent UI blocking
- **Memory limits**: Cache size limits with LRU eviction for large workspaces
- **File watching**: Debounced file change handling (300ms default) to avoid excessive re-parsing

---

## File discovery & project conventions
Support two modes:
1. **Convention-based (default)**
   - Root: `main.md`
   - Sections: `sections/**/*.md`

2. **Config-based (optional)**
   - VS Code settings (preferred):
     - `weave.rootFile` (default: `main.md`)
     - `weave.sectionsGlob` (default: `sections/**/*.md`)
   - `.weaverc.json` (for non-VS Code tooling compatibility):
     - Same fields, allows sharing config with CLI tools or other editors
     - VS Code settings take precedence if both exist

**Why:** minimal friction for "standard" adoption, but allow flexibility.

---

## Data model used by the extension

### Section
Minimum fields:
- `id: string` *(required)*
- `title?: string`
- `peek?: string`
- `uri: vscode.Uri`
- `bodyMarkdown: string`
- `frontmatterRange?: vscode.Range` *(for navigation)*

### Reference occurrence
- `fromId: string` *(or “main” for root)*
- `toId: string`
- `uri: vscode.Uri`
- `range: vscode.Range` *(for diagnostics + navigation)*
- `rawHref: string` *(original link text)*

### Recommended incremental index model
Store indices per file; derive global views from those indices:

- `fileIndexByUri: Map<string, FileIndex>`
- Derived:
  - `sectionsById: Map<string, Section>`
  - `incomingRefs/outgoingRefs` maps (optional)
  - `occurrences` (derived aggregation for queries/backlinks)

---

## Parsing & indexing plan

### Validation Layer (Hybrid Approach)

**1) Lightweight Validation (Always On)**
- Use `@weave-md/validate` functions for real-time validation
- Fast syntax and structure validation as user types
- Validate **active document** on keystroke (debounced)
- Validate **changed files** on save/create/update/delete (watcher-driven)
- Extract required information:
  - Section metadata (id, title, peek) from frontmatter
  - Node links with full parameter support (display, export, unknown params)
  - Weave format elements for validation
  - Diagnostic information from lightweight validation

**2) Full AST Validation (On-Demand)**
- Use `@weave-md/parse` for comprehensive validation with full AST generation
- Available via command or automatic triggers (save, periodic background check)
- Deep conformance checking and edge case detection
- Updates indices/graph with additional validation results

**3) Build Workspace Graph**
- Extract `sections` and `links` from validation results
- Recommended: update per-file index, then derive global maps:
  - `sectionsById: Map<string, Section>`
  - `outgoingRefs: Map<fromId, Map<toId, count>>`
  - `incomingRefs: Map<toId, Map<fromId, count>>`
  - `occurrences: Array<{uri, range, fromId, toId, rawHref}>`

**4) Emit Diagnostics**
- Transform validation results into VS Code Problems panel entries:
  - **Lightweight**: Missing required frontmatter, invalid node: URLs, syntax errors
  - **Full AST**: Complex parsing issues, conformance test failures
  - Distinguish between validation levels in diagnostic severity

**5) Incremental Updates**
- Watch for file changes (create/update/delete)
- Update per-file indices; re-derive global views as needed
- Use debouncing and small batches for stability

---

## Preview Layer (built-in Markdown preview + markdown-it)

**Principle:** the preview layer does not fetch content at runtime. Any content needed for expansion/overlay/notes is embedded during markdown-it rendering from host-owned shared state.

- Uses VS Code's built-in markdown-it for tokenization
- Custom plugins for Weave-specific transformations
- Validation layer provides diagnostics separately
- Preview scripts/styles only manipulate DOM

---

## Layer Communication (host-owned shared state, no preview RPC)

### Data Flow
1. **Validation → Preview**: Host maintains authoritative caches (`sectionsById`, per-file indices). The markdown-it plugin reads them at render time to resolve and embed content.
2. **Preview → Validation**: No runtime messaging required. (Optional analytics later must not affect correctness.)

### Communication Mechanisms
- **Host-owned shared state**: in-memory cache of parsed/validated results accessible to both validation and preview render (same extension host process)
- **VS Code APIs**: file watchers + document change events to update indices
- **Per-file indices**: `fileIndexByUri: Map<string, FileIndex>` for incremental correctness
- **Derived global views**: `sectionsById`, `incomingRefs/outgoingRefs` maps computed from per-file indices
- **Rendered HTML cache**: `cachedHtmlBySectionId: Map<string, CachedHtml>` for embedded expansions/overlays
- **Invalidation rules**: update per-file index on file change; re-derive global views as needed; clear HTML cache for affected sections
- **No "webview messages" dependency** for preview correctness

### Optional/Experimental: Preview RPC (Non-blocking)
> This section is optional and can be cut without changing core semantics.
> 
> Future analytics or advanced interactions could use preview-to-host messaging, but all core features must work without it. Any such implementation should be:
> - Explicitly marked as experimental
> - Non-blocking (extension continues working if messaging fails)
> - Never required for correctness or basic functionality

---

## Error Coordination (aligned with native preview constraints)

### Validation Layer Errors
- Appear in VS Code Problems panel with specific codes.

### Preview Layer Fallbacks
Preview must always render *something*:
- Missing/invalid `node:` target → render as normal link + minimal "missing" badge
- Expansion suppressed by limits → render stub: "(Preview truncated) Open section…"
- Cycle detected → render "Already expanded above → jump" affordance
- **Blocking errors**: disable Weave enhancements for affected constructs; preview still renders as normal Markdown
- Severe errors → disable enhancements for affected constructs; keep standard markdown rendering

### No-JS Fallback Behavior
Preview remains usable without JavaScript:
- **Static rendering**: All embedded content is pre-rendered in HTML during markdown-it processing
- **Basic navigation**: `node:` links render as standard markdown links to section files
- **Content visibility**: Inline and stretch content shows fully; overlay content appears as collapsed sections with "Expand" text
- **Numbering**: Footnote/sidenote numbers are pre-generated and embedded in HTML
- **Math formatting**: KaTeX renders to static HTML/CSS without requiring runtime JavaScript
- **Critical rule**: All core functionality works without JavaScript; JS only enhances interactivity

**Critical rule:** preview never hard-fails; it degrades to standard Markdown semantics.

### Error Categories
1. **Blocking Errors** (disable Weave enhancements for affected constructs):
   - Missing required frontmatter
   - Invalid YAML structure in media blocks
   - Corrupted AST parsing

2. **Warning Errors** (show warnings, keep preview):
   - Unknown frontmatter fields
   - Unknown node: URL parameters
   - Missing optional media fields

3. **Info Messages** (log only):
   - Successful conformance validation
   - Performance metrics

### Recovery Strategies
- **Automatic retry**: re-validate on file change/save after errors are fixed
- **Graceful degradation**: downgrade to stub rendering when limits are reached
- **Incremental healing**: fix individual construct errors without disabling entire preview

---

## Preview rendering approach

### Markdown-it Plugin Architecture
Register a VS Code Markdown extension that adds custom markdown-it plugins via `extendMarkdownIt`.

#### 1. Node Link Plugin
- **Tokenization**: recognize `node:` URLs during tokenization
- **Transformation**: replace standard link tokens with custom Weave link tokens
- **Rendering**:
  - parse `node:` URL using `@weave-md/core`
  - resolve target section from shared state
  - **pre-render** expansion/overlay/note bodies (depth + size limited)
  - emit HTML with data attributes for DOM-only JS behavior

#### 2. Weave Format Plugin
- **Math blocks**: transform ````math`...```` blocks into KaTeX-rendered HTML (bundle KaTeX assets locally)
- **Media blocks**: convert ````image`...``, ````gallery`...``, etc. into semantic HTML (safe subset; avoid unsafe embeds)
- **Inline math**: process `:math[...]` syntax during tokenization
- **Text formatting**: handle strikethrough, tables, autolinks via existing GFM plugins

#### 3. Rendering Pipeline
```
Markdown Source → markdown-it Tokenization → Custom Plugins → HTML Output
                     ↓
              VS Code built-in Markdown preview UI
                     ↓
   Injected previewScripts (DOM-only interactivity) + previewStyles
```

### Plugin Implementation Strategy

**Node Link Plugin (illustrative)**
```javascript
if (token.attrGet('href')?.startsWith('node:')) {
  const parsed = parseNodeUrl(token.attrGet('href'))
  token.type = 'weave_node_link'
  token.meta = {
    targetId: parsed.id,
    display: parsed.display,
    exportHint: parsed.export,
    unknownParams: parsed.unknownParams
    // plus: pre-render decisions (depth/limits) if you keep them in meta
  }
}
```

**Weave Format Plugin (illustrative)**
```javascript
if (token.info === 'math') {
  token.type = 'weave_math_block'
}

if (['image', 'gallery', 'audio', 'video', 'embed', 'voiceover'].includes(token.info)) {
  token.type = 'weave_media_block'
}
```

### JavaScript Enhancement Layer (previewScripts)

**Interactive Behavior**
- Expand/collapse for `inline` and `stretch` display modes (DOM toggle only)
- Hover/click popovers for `overlay` mode (DOM show/hide + positioning)
- Numbering pass for `footnote` and `sidenote` (DOM walk in document order)
- Margin note best-effort placement (rail/inline/overlay fallback)

**Cycle Safety**
- Cycles are handled at render time (preferred). JS only handles UI toggles and “jump” affordances.

**Numbering Semantics**
- Define explicit rules:
  - Count notes in DOM order of the rendered document
  - Expanded content contributes when visible (or always; pick one and keep consistent)
  - Overlay-only content does not affect numbering

### Preview Click Behavior
- **Built-in preview**: `node:` links render as standard markdown links using VS Code's link resolution
- **Link format**: Generate standard markdown links `[text](section-file.md#frontmatter)` or `[text](section-file.md)`
- **Navigation**: Clicking opens the target section file in editor (VS Code's default link behavior)
- **No command links**: Avoid `command:weave.goto` format; rely on standard markdown link semantics
- **Editor providers**: Go-to-definition and peek functionality handled by language providers, not preview clicks

### Link Format Constraints
- **Standard links only**: Use `file://` or relative path links that VS Code's preview can resolve natively
- **No custom protocols**: Avoid `weave://` or `command://` schemes in preview HTML
- **Fallback URLs**: If section file cannot be determined, render as plain text without link formatting
- **Cross-file references**: All `node:` references must resolve to actual file paths in the workspace

### Performance Considerations
- Render-time embedding must be bounded:
  - `weave.maxPreviewDepth` default: 3
  - Recommend: `weave.maxExpandedCharsPerRef`
  - Recommend: `weave.maxExpandedRefsPerDoc`
- Use shared-state caching to avoid re-parsing section bodies during every render

### Styling (minimal)
- Depth indentation + subtle border
- Simple collapse affordance
- “Open section” link (normal link semantics; editor navigation handled by DefinitionProvider/commands)

---

## Weave format support

The extension must provide basic preview support for Weave format elements:

### Math elements
- **Block math**: ````math`...```` blocks rendered with KaTeX
- **Inline math**: `:math[...]` syntax rendered inline
- **Validation**: ensure proper syntax and bracket matching

### Media elements
- **Image**: ````image`...```` blocks with file, alt, caption, width
- **Gallery**: ````gallery`...```` blocks with multiple files
- **Audio**: ````audio`...```` blocks with playback controls
- **Video**: ````video`...```` blocks with advanced controls
- **Embed**: ````embed`...```` blocks for external content (safe subset; may be restricted)
- **Voiceover**: ````voiceover`...```` blocks for narration

### Text formatting
- **Strikethrough**: `~~text~~` support
- **Tables**: GFM-compatible table parsing
- **Autolink literals**: automatic URL/email linking
- **Preformatted text**: ````pre`...```` blocks with exact spacing

---

## Language Features (Direct Implementation)

### Approach: Simple VS Code Language Providers
Use VS Code's built-in language provider APIs rather than a full language server.

### 1. Completion Provider

**Node Link Completion**:
```typescript
class WeaveCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument, 
    position: vscode.Position
  ): vscode.CompletionItem[] {
    const line = document.lineAt(position).text
    const beforeCursor = line.substring(0, position.character)
    
    // Stage 1: Suggest "node:" when starting a link
    const linkMatch = beforeCursor.match(/]\((n|no|nod|node)$/)
    if (linkMatch) {
      return [
        { 
          label: 'node:', 
          kind: vscode.CompletionItemKind.Reference,
          insertText: 'node:',
          documentation: 'Weave node reference'
        }
      ]
    }
    
    // Stage 2: Node: ID completion - triggers after "node:"
    if (beforeCursor.includes('node:')) {
      return getSectionIds().map(id => ({
        label: id,
        kind: vscode.CompletionItemKind.Reference,
        insertText: id,
        documentation: `Section: ${id}`
      }))
    }
    
    // Stage 3: Parameter completion - triggers after "?"
    if (beforeCursor.includes('node:') && beforeCursor.includes('?')) {
      return [
        { label: 'display', kind: vscode.CompletionItemKind.Property },
        { label: 'export', kind: vscode.CompletionItemKind.Property }
      ]
    }
    
    return []
  }
}

// Register with trigger characters
vscode.languages.registerCompletionItemProvider(
  'markdown', 
  new WeaveCompletionProvider(), 
  'n', ':', '?', '='
)
```

**Frontmatter Completion**:
```typescript
// Inside YAML frontmatter (detect by context)
if (isInFrontmatter(document, position)) {
  return [
    { label: 'id', kind: vscode.CompletionItemKind.Field },
    { label: 'title', kind: vscode.CompletionItemKind.Field },
    { label: 'peek', kind: vscode.CompletionItemKind.Field }
  ]
}
```

### 2. Hover Provider

**Section Preview on Hover**:
```typescript
class WeaveHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument, 
    position: vscode.Position
  ): vscode.Hover {
    // Use regex that captures full node: URL including hyphens and query params
    const range = document.getWordRangeAtPosition(position, /node:[\w-]+(?:\?[^)\]\s]*)*/)
    if (range) {
      // Parse using @weave-md/core for proper URL handling
      const parsed = parseNodeUrl(document.getText(range))
      if (parsed) {
        const section = getSectionById(parsed.id)
        if (section?.peek) {
          return new vscode.Hover(section.peek, range)
        }
      }
    }
  }
}
```

### 3. Definition Provider

**Go to Section Definition**:
```typescript
class WeaveDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument, 
    position: vscode.Position
  ): vscode.Location {
    const range = document.getWordRangeAtPosition(position, /node:\w+/)
    if (range) {
      const nodeId = range.text.replace('node:', '')
      const section = getSectionById(nodeId)
      if (section?.uri) {
        return new vscode.Location(section.uri, section.frontmatterRange)
      }
    }
  }
}
```

### 4. Diagnostics Provider

**Real-time Validation**:
```typescript
class WeaveDiagnosticProvider {
  validateDocument(document: vscode.TextDocument): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = []
    
    // Check for missing frontmatter
    if (!hasFrontmatter(document)) {
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 0),
        'Weave documents must start with YAML frontmatter',
        vscode.DiagnosticSeverity.Error
      ))
    }
    
    // Validate node: links (using text scanner for accurate ranges)
    const nodeLinks = findNodeLinks(document)
    for (const link of nodeLinks) {
      if (!getSectionById(link.targetId)) {
        diagnostics.push(new vscode.Diagnostic(
          link.range,
          `Section '${link.targetId}' not found`,
          vscode.DiagnosticSeverity.Error
        ))
      }
    }
    
    return diagnostics
  }
}
```

### 5. Data Sources for Language Features

**From Validation Layer**:
- `getSectionIds()` - Array of valid section IDs
- `getSectionById(id)` - Section metadata and URI
- `getWorkspaceGraph()` - Complete reference graph

**From Spec**:
- Parameter enums (`display`, `export` values)
- Frontmatter field definitions
- Validation rules

**Benefits of Direct Implementation**:
- **Simpler**: No separate language server process
- **Integrated**: Uses same validation layer data
- **Performant**: Low overhead, fast response
- **Maintainable**: All in one extension

---

## VS Code UX features

### Commands
- `Weave: Go to Section Definition`
  - works in editor via cursor/selection on `node:`
  - in built-in preview, clicking renders as normal link; navigation handled by editor provider
- `Weave: Peek Section`
  - show peek text (or excerpt) in a quick pick / hover
- `Weave: Show Backlinks (1 hop)`
  - list incoming references to the current section
  - select → open referring file at the reference occurrence
- `Weave: Full Conformance Check`
  - Run comprehensive AST validation using `@weave-md/parse`
  - Deep conformance checking and edge case detection
  - Shows detailed results in Problems panel
- `Weave: Validate Workspace`
  - Quick validation using `@weave-md/validate`
  - Fast syntax and structure check
  - Immediate feedback on common issues

### Diagnostics
- Problems panel entries with:
  - code: `WEAVE001`, `WEAVE002`, …
  - message, severity, and a suggested fix
- Quick fixes (CodeActions):
  - Create missing section file stub for missing target
  - Rename duplicate IDs (guided; may be "unsafe")
  - Remove unknown query params

### Settings
- `weave.rootFile` default: `main.md`
- `weave.sectionsGlob` default: `sections/**/*.md`
- `weave.enablePreviewEnhancements` default: true
- `weave.maxPreviewDepth` default: 3
- `weave.peekMaxChars` default: 240
- *(recommended)* `weave.maxExpandedCharsPerRef` default: e.g. 12_000
- *(recommended)* `weave.maxExpandedRefsPerDoc` default: e.g. 50

---

## Testing strategy

### Unit tests (Node)
- Frontmatter parsing and ID extraction (per spec validation rules)
- `node:` URL parsing (delegate to `@weave-md/core`)
- Text-based occurrence scanning for accurate ranges (not markdown-it tokens)
- Graph construction correctness (incremental updates)
- Diagnostics generation (golden tests with fixtures)
- Weave format element parsing (math blocks, media blocks, etc.)
- Spec conformance tests (use `@weave-md/validate` conformance suite)

### Integration tests (VS Code)
- Use VS Code Extension Test Runner:
  - open fixture workspace
  - verify diagnostics count and codes
  - verify commands open correct files
  - **Preview tests**: token/HTML golden tests for markdown-it plugin output
  - **Preview smoke tests**: verify scripts/styles load (limited DOM interaction)
  - test display modes render correctly (baseline HTML output)
  - test Weave format elements render in preview (baseline HTML output)
  - test cycle safety and truncation limits in rendered output

---

## Milestones

### M0 — Skeleton
- Scaffold extension, activation events, settings
- Minimal indexer that loads files and parses section IDs
- Basic diagnostics: duplicate IDs, missing targets (coarse)

### M1 — Validator UX
- Accurate reference extraction with text scanner for editor ranges
- Full diagnostics + codes
- Quick fixes: create missing section stub
- **Spec conformance**: pass all frontmatter and node-link conformance tests

### M2 — Preview enhancements (baseline)
- Markdown-it plugin rewrites `node:` links in preview
- Expand/collapse inline (render-time embedded bodies + DOM toggle)
- Cycle-safe expansion (render-time)
- Basic depth styling
- **Display modes**: support spec display modes with native-preview-friendly UX
- **Numbering**: implement footnote/sidenote numbering semantics
- **Acceptance criteria**: No preview RPC required for correctness

### M3 — Navigation polish
- Go-to-definition from editor providers (preview clicks are normal links)
- Peek section
- Backlinks (1 hop)
- Weave format support: math + basic media + text formatting
- **Acceptance criteria**: Depth/size limits enforced, cycle-safe in renderer

### M4 — "Standard credibility" hardening
- Performance pass (incremental updates, debouncing, embedding limits)
- Robustness on large docs
- Better error messaging and docs
- **Full spec conformance**: 100% pass rate on conformance test suite
- Publish to Marketplace + versioning policy
- **Acceptance criteria**: All core features work without preview RPC

---

## Versioning & compatibility
- Extension displays supported Weave spec version:
  - reads `@weave-md/core` `SPEC_VERSION` (currently v0.1.0-alpha.0)
- If file declares newer spec, warn (don’t break).
- Keep preview behavior stable and minimal; avoid UX churn.
- Spec conformance: extension must pass all normative conformance tests from `@weave-md/validate`
- Note: packages are in alpha status (0.1.0-alpha.0)

---

## README content checklist
- What the extension does / doesn’t do
- Project layout conventions (`main.md`, `sections/`)
- How to write `node:` references
- How to use Preview
- Troubleshooting + known limitations
- Contributing guide (issues, fixtures, tests)

---

## Security & privacy
- Local-only: never send document content over the network.
- Avoid executing arbitrary scripts in preview; only inject your own known JS/CSS.
- Treat markdown rendering as untrusted:
  - consider sanitizing HTML if you allow raw HTML in markdown
  - or disable raw HTML rendering in preview enhancements

---

## Preview Integration Constraints

This extension intentionally enhances VS Code's built-in Markdown preview only. It does not attempt to integrate with preview-replacement extensions (e.g. Markdown Preview Enhanced). If another extension replaces the preview renderer, Weave preview enhancements may not apply.

### Markdown-it Usage
- All markdown-it plugins used by the extension must be pure, synchronous, and side-effect free.
- Plugins must not perform file I/O, async work, RPC, or workspace scanning.
- Plugins consume host-owned, in-memory caches only.
- All markdown-it transformations must be idempotent. If a token or HTML node is already transformed (e.g. marked with `data-weave="1"`), the plugin must no-op.
- The renderer must not rely on execution order relative to other markdown-it plugins.

### Preview Scripts (JavaScript)
- Scripts must be idempotent and use event delegation.
- Scripts must only interact with DOM elements created by Weave (e.g. `.weave-*`), and must not mutate or reparent nodes created by other renderers.

### Preview Styling (CSS)
- All preview styles must be strictly namespaced (e.g. `.weave-*`).
- The extension must not style global HTML tags (`a`, `p`, `sup`, `code`, etc.).
- Styling should inherit from the active VS Code theme wherever possible.
- Layout must degrade gracefully on narrow or constrained preview widths.

### Preview Refresh Model
- Because content is embedded at render time, preview output may become stale when the workspace index updates.
- The extension may trigger debounced preview refreshes when necessary, or expose a manual "Refresh Weave Preview" command.
