import * as vscode from 'vscode';
import { getIndexStore } from '../validation/indexStore';
import { isInFrontmatter } from '../validation/lightweightValidator';

/**
 * Completion provider for Weave documents
 */
export class WeaveCompletionProvider implements vscode.CompletionItemProvider {
  
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.CompletionItem[] | undefined {
    const line = document.lineAt(position).text;
    const beforeCursor = line.substring(0, position.character);

    // Stage 1: Suggest "node:" when starting a link
    const linkMatch = beforeCursor.match(/\]\((n|no|nod|node)?$/);
    if (linkMatch) {
      return [
        {
          label: 'node:',
          kind: vscode.CompletionItemKind.Reference,
          insertText: 'node:',
          documentation: 'Weave node reference',
          detail: 'Insert a Weave section reference'
        }
      ];
    }

    // Stage 2: Node ID completion - triggers after "node:"
    const nodeIdMatch = beforeCursor.match(/\]\(node:([^?\s)]*)$/);
    if (nodeIdMatch) {
      const partialId = nodeIdMatch[1];
      const indexStore = getIndexStore();
      const sectionIds = indexStore.getSectionIds();

      return sectionIds
        .filter(id => id.startsWith(partialId))
        .map(id => {
          const section = indexStore.getSectionById(id);
          return {
            label: id,
            kind: vscode.CompletionItemKind.Reference,
            insertText: id,
            documentation: section?.peek || section?.title || `Section: ${id}`,
            detail: section?.title || 'Weave section'
          };
        });
    }

    // Stage 3: Parameter completion - triggers after "?"
    const paramMatch = beforeCursor.match(/\]\(node:[^?\s)]+\?([^)\s]*)$/);
    if (paramMatch) {
      const existingParams = paramMatch[1];
      const items: vscode.CompletionItem[] = [];

      // Check which params are already present
      const hasDisplay = existingParams.includes('display=');
      const hasExport = existingParams.includes('export=');

      if (!hasDisplay) {
        items.push({
          label: 'display',
          kind: vscode.CompletionItemKind.Property,
          insertText: existingParams && !existingParams.endsWith('&') ? '&display=' : 'display=',
          documentation: 'How to display the referenced section',
          detail: 'Display mode parameter'
        });
      }

      if (!hasExport) {
        items.push({
          label: 'export',
          kind: vscode.CompletionItemKind.Property,
          insertText: existingParams && !existingParams.endsWith('&') ? '&export=' : 'export=',
          documentation: 'Export hint for the reference',
          detail: 'Export parameter'
        });
      }

      return items;
    }

    // Stage 4: Display value completion
    const displayValueMatch = beforeCursor.match(/display=([^&)\s]*)$/);
    if (displayValueMatch) {
      const displayValues = ['inline', 'stretch', 'overlay', 'footnote', 'sidenote', 'margin'];
      const partial = displayValueMatch[1];

      return displayValues
        .filter(v => v.startsWith(partial))
        .map(value => ({
          label: value,
          kind: vscode.CompletionItemKind.EnumMember,
          insertText: value,
          documentation: getDisplayDescription(value),
          detail: 'Display mode'
        }));
    }

    // Stage 5: Export value completion
    const exportValueMatch = beforeCursor.match(/export=([^&)\s]*)$/);
    if (exportValueMatch) {
      const exportValues = ['include', 'exclude', 'reference'];
      const partial = exportValueMatch[1];

      return exportValues
        .filter(v => v.startsWith(partial))
        .map(value => ({
          label: value,
          kind: vscode.CompletionItemKind.EnumMember,
          insertText: value,
          documentation: getExportDescription(value),
          detail: 'Export hint'
        }));
    }

    // Frontmatter completion
    if (isInFrontmatter(document, position)) {
      return provideFrontmatterCompletions(beforeCursor);
    }

    return undefined;
  }
}

/**
 * Provides completions for frontmatter fields
 */
function provideFrontmatterCompletions(beforeCursor: string): vscode.CompletionItem[] {
  // Check if we're at the start of a line (for field names)
  if (/^\s*$/.test(beforeCursor) || /^\s*[a-z]*$/.test(beforeCursor)) {
    return [
      {
        label: 'id',
        kind: vscode.CompletionItemKind.Field,
        insertText: 'id: ',
        documentation: 'Unique identifier for this section (required)',
        detail: 'Required field'
      },
      {
        label: 'title',
        kind: vscode.CompletionItemKind.Field,
        insertText: 'title: ',
        documentation: 'Display title for this section',
        detail: 'Optional field'
      },
      {
        label: 'peek',
        kind: vscode.CompletionItemKind.Field,
        insertText: 'peek: ',
        documentation: 'Short preview text shown on hover',
        detail: 'Optional field'
      }
    ];
  }

  return [];
}

/**
 * Returns description for display mode values
 */
function getDisplayDescription(value: string): string {
  const descriptions: Record<string, string> = {
    'inline': 'Expand content inline with a toggle',
    'stretch': 'Expand content to full width',
    'overlay': 'Show content in a popover on hover/click',
    'footnote': 'Show as numbered footnote at bottom',
    'sidenote': 'Show as numbered note in the margin',
    'margin': 'Show as unnumbered margin note'
  };
  return descriptions[value] || value;
}

/**
 * Returns description for export hint values
 */
function getExportDescription(value: string): string {
  const descriptions: Record<string, string> = {
    'include': 'Include full content in exports',
    'exclude': 'Exclude from exports',
    'reference': 'Include as reference only'
  };
  return descriptions[value] || value;
}

/**
 * Registers the completion provider
 */
export function registerCompletionProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      'markdown',
      new WeaveCompletionProvider(),
      '(', ':', '?', '=', '&'
    )
  );
}
