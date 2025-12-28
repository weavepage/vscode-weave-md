# Weave Markdown VS Code Extension

A spec-compliant preview renderer, validator, and navigation helper for Weave documents in VS Code.

## Features

### Validation
- Real-time validation of Weave documents as you type
- Problems panel integration with specific error codes
- Quick fixes for common issues (create missing sections, add frontmatter)

### Preview Enhancements
- Expandable `node:` references in VS Code's built-in Markdown preview
- Support for all display modes: inline, stretch, overlay, footnote, sidenote, margin
- Math rendering with KaTeX
- Media blocks: image, gallery, audio, video
- Cycle-safe expansion with depth limits

### Navigation
- Go to Definition for `node:` references (F12 or Ctrl+Click)
- Hover preview showing section peek text
- Backlinks command to find all references to a section
- Autocomplete for section IDs and parameters

## Project Layout

Weave uses a convention-based project structure:

```
your-project/
  main.md              # Root document
  sections/            # Section files
    intro.md
    chapter-1.md
    ...
```

### Section File Format

Each section file requires YAML frontmatter with an `id` field:

```markdown
---
id: intro
title: Introduction
peek: A brief overview of the topic
---

Your section content here...
```

## Writing Node References

Reference other sections using the `node:` URL scheme:

```markdown
See the [introduction](node:intro) for more details.

With display mode: [details](node:intro?display=overlay)

With export hint: [reference](node:intro?export=include)
```

### Display Modes

- `inline` - Expandable content with toggle (default)
- `stretch` - Full-width expandable content
- `overlay` - Popover on hover/click
- `footnote` - Numbered footnote at bottom
- `sidenote` - Numbered note in margin
- `margin` - Unnumbered margin note

## Commands

- `Weave: Go to Section Definition` - Navigate to the referenced section
- `Weave: Peek Section` - Quick preview of section content
- `Weave: Show Backlinks (1 hop)` - Find all references to current section
- `Weave: Full Conformance Check` - Run comprehensive validation
- `Weave: Validate Workspace` - Validate all Weave files

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `weave.rootFile` | `main.md` | Root file for the Weave document |
| `weave.sectionsGlob` | `sections/**/*.md` | Glob pattern for section files |
| `weave.enablePreviewEnhancements` | `true` | Enable Weave preview enhancements |
| `weave.maxPreviewDepth` | `3` | Maximum depth for nested expansions |
| `weave.peekMaxChars` | `240` | Maximum characters in peek preview |
| `weave.maxExpandedCharsPerRef` | `12000` | Maximum characters per expanded reference |
| `weave.maxExpandedRefsPerDoc` | `50` | Maximum expanded references per document |

## Troubleshooting

### Preview not showing Weave enhancements
- Ensure `weave.enablePreviewEnhancements` is enabled
- Check that your files match the configured glob patterns
- Verify frontmatter has valid YAML syntax

### Section not found errors
- Check that the section ID matches exactly (case-sensitive)
- Ensure the section file is within the configured `sectionsGlob` pattern
- Run `Weave: Validate Workspace` to refresh the index

### Performance issues with large documents
- Reduce `weave.maxPreviewDepth` to limit expansion depth
- Reduce `weave.maxExpandedRefsPerDoc` to limit total expansions
- Consider splitting very large sections

## Known Limitations

- External embeds are restricted for security
- Math rendering requires KaTeX (bundled)
- Sidenotes/margin notes may fall back to inline on narrow viewports
- Preview enhancements require JavaScript enabled

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Run tests
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

Please include test fixtures for any new validation rules or preview features.

## License

MIT
