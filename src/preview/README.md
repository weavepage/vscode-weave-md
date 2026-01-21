# Preview Module

This module handles rendering Weave markdown content in VS Code's preview pane.

## Directory Structure

```
src/preview/
├── markdownItPlugin.ts     # Main markdown-it plugin orchestrator
├── weaveRenderer.ts        # Weave content renderer using @weave-md/parse
├── types.ts                # Shared TypeScript interfaces
├── utils.ts                # Shared utility functions and constants
├── renderers/              # Display-specific renderers
│   ├── index.ts            # Barrel export
│   ├── inlineRenderer.ts   # display=inline
│   ├── stretchRenderer.ts  # display=stretch (allows nesting)
│   ├── overlayRenderer.ts  # display=overlay
│   ├── footnoteRenderer.ts # display=footnote
│   ├── sidenoteRenderer.ts # display=sidenote
│   ├── marginRenderer.ts   # display=margin
│   ├── panelRenderer.ts    # display=panel
│   ├── mediaRenderers.ts   # Fenced blocks: math, image, gallery, audio, video, embed, pre
│   ├── substitutionRenderer.ts  # Inline :math[] and :sub[] syntax
│   └── nestedTemplates.ts  # Nested link template generation
└── client/
    ├── weavePreview.ts     # Client-side JavaScript for interactivity
    └── weavePreview.css    # Styles for all Weave elements
```

## Architecture

### Constraints

All plugins follow these constraints from the project plan:

- Pure, synchronous, and side-effect free
- Consume host-owned, in-memory caches only (no file I/O)
- All transformations are idempotent (check `data-weave="1"`)
- Renderer does not rely on execution order relative to other plugins

### Key Components

#### `markdownItPlugin.ts`

Exports two markdown-it plugins:

- **`createWeavePlugin`**: Transforms `node:` links into interactive Weave elements
- **`createWeaveFormatPlugin`**: Handles fenced code blocks (math, media) and inline syntax

#### `weaveRenderer.ts`

Uses `@weave-md/parse` to convert Weave markdown to HTML via:
1. Parse markdown to mdast
2. Transform custom mdast nodes (weaveNodeLink, inlineMath)
3. Convert mdast to hast
4. Transform hast for Weave-specific elements
5. Convert hast to HTML

#### `types.ts`

Shared interfaces:
- `PreviewConfig` - VS Code settings for preview
- `ParsedNodeUrl` - Parsed `node:` URL components
- `RenderContext` - State tracking during rendering
- `FootnoteEntry` - Footnote collection data
- `InlineContentEntry` - Deferred content rendering

#### `utils.ts`

Shared utilities:
- `escapeHtml()` - HTML entity escaping
- `parseNodeUrl()` - Parse `node:id?display=...` URLs
- `getPreviewConfig()` - Read VS Code settings
- `createRenderContext()` - Initialize render state
- `renderBasicMarkdown()` - Simple markdown-to-HTML for notes
- `extractContentAfterFrontmatter()` - Strip YAML frontmatter
- SVG icon constants (`ICON_PLUS`, `ICON_MINUS`, `ICON_INFO`)

### Display Types

| Type | Renderer | Behavior |
|------|----------|----------|
| `inline` | `inlineRenderer.ts` | Expands content inline, strips nested node links |
| `stretch` | `stretchRenderer.ts` | Expands content inline, allows nesting |
| `overlay` | `overlayRenderer.ts` | Shows content in positioned overlay |
| `footnote` | `footnoteRenderer.ts` | Superscript reference, content at page bottom |
| `sidenote` | `sidenoteRenderer.ts` | Numbered note in margin (wide screens) |
| `margin` | `marginRenderer.ts` | Unnumbered note in margin |
| `panel` | `panelRenderer.ts` | Slide-in panel from edge |

### Client-Side Behavior

`client/weavePreview.ts` handles:
- Click/keyboard event delegation for all Weave elements
- Expand/collapse for inline, stretch, overlay, panel
- Sidenote/margin note responsive behavior
- Footnote navigation (jump to/from)
- YouTube embed lazy loading
- Substitution `:sub[]{}` activation

## Usage

The plugins are registered with VS Code's markdown preview in `extension.ts`:

```typescript
import { createWeavePlugin, createWeaveFormatPlugin } from './preview/markdownItPlugin';

return md.use(createWeavePlugin).use(createWeaveFormatPlugin);
```

## Adding New Display Types

1. Create `renderers/newTypeRenderer.ts` with render function
2. Export from `renderers/index.ts`
3. Add case to `renderNodeLink()` switch in `markdownItPlugin.ts`
4. Add client-side handler in `client/weavePreview.ts`
5. Add styles in `client/weavePreview.css`
