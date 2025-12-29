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
      const item = new vscode.CompletionItem('node:', vscode.CompletionItemKind.Reference);
      item.insertText = 'node:';
      item.documentation = 'Weave node reference';
      item.detail = 'Insert a Weave section reference';
      item.command = {
        command: 'editor.action.triggerSuggest',
        title: 'Trigger Suggest'
      };
      return [item];
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

    // Stage 3: Display value completion - must check before parameter completion
    const displayValueMatch = beforeCursor.match(/\]\(node:[^)]*[?&]display=([^&)\s]*)$/);
    if (displayValueMatch) {
      const displayValues = ['inline', 'stretch', 'overlay', 'footnote', 'sidenote', 'margin', 'page'];
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

    // Stage 4: Export value completion - must check before parameter completion
    const exportValueMatch = beforeCursor.match(/\]\(node:[^)]*[?&]export=([^&)\s]*)$/);
    if (exportValueMatch) {
      const exportValues = ['appendix', 'inline', 'omit'];
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

    // Stage 5: Parameter completion - triggers after "?" or "&"
    const paramMatch = beforeCursor.match(/\]\(node:[^?\s)]+\?(.*)$/);
    if (paramMatch) {
      const afterQuestion = paramMatch[1];
      const items: vscode.CompletionItem[] = [];

      // Check which params are already present
      const hasDisplay = afterQuestion.includes('display=');
      const hasExport = afterQuestion.includes('export=');
      
      // Find where the current incomplete param starts (after last & or at start)
      const lastAmpersand = afterQuestion.lastIndexOf('&');
      const incompleteParam = lastAmpersand >= 0 ? afterQuestion.slice(lastAmpersand + 1) : afterQuestion;
      const replaceLength = incompleteParam.length;

      if (!hasDisplay && 'display'.startsWith(incompleteParam.replace('=', ''))) {
        const displayItem = new vscode.CompletionItem('display', vscode.CompletionItemKind.Property);
        displayItem.insertText = 'display=';
        displayItem.documentation = 'How to display the referenced section';
        displayItem.detail = 'Display mode parameter';
        displayItem.range = new vscode.Range(position.translate(0, -replaceLength), position);
        displayItem.command = { command: 'editor.action.triggerSuggest', title: 'Trigger Suggest' };
        items.push(displayItem);
      }

      if (!hasExport && 'export'.startsWith(incompleteParam.replace('=', ''))) {
        const exportItem = new vscode.CompletionItem('export', vscode.CompletionItemKind.Property);
        exportItem.insertText = 'export=';
        exportItem.documentation = 'Export hint for the reference';
        exportItem.detail = 'Export parameter';
        exportItem.range = new vscode.Range(position.translate(0, -replaceLength), position);
        exportItem.command = { command: 'editor.action.triggerSuggest', title: 'Trigger Suggest' };
        items.push(exportItem);
      }

      return items;
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
    'margin': 'Show as unnumbered margin note',
    'page': 'Full page reference'
  };
  return descriptions[value] || value;
}

/**
 * Returns description for export hint values
 */
function getExportDescription(value: string): string {
  const descriptions: Record<string, string> = {
    'appendix': 'Prefer appendix placement',
    'inline': 'Prefer inline expansion',
    'omit': 'Exclude from export'
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
