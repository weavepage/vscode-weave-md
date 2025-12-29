import * as vscode from 'vscode';
import { getIndexStore } from '../validation/indexStore';
import { parseNodeUrl } from '../validation/lightweightValidator';

/**
 * Reference provider for Weave documents
 * Enables Shift+F12 to find all references to a section
 */
export class WeaveReferenceProvider implements vscode.ReferenceProvider {
  
  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.ReferenceContext,
    _token: vscode.CancellationToken
  ): vscode.Location[] | undefined {
    const indexStore = getIndexStore();
    
    // Check if cursor is on a node: URL
    const nodeRange = document.getWordRangeAtPosition(
      position,
      /node:[\w-]+(?:\?[^)\]\s]*)?/
    );
    
    let targetId: string | undefined;
    
    if (nodeRange) {
      // Cursor is on a node link - find references to that target
      const text = document.getText(nodeRange);
      const parsed = parseNodeUrl(text);
      if (parsed) {
        targetId = parsed.id;
      }
    } else {
      // Check if cursor is in a section's frontmatter ID
      const line = document.lineAt(position).text;
      const idMatch = line.match(/^id:\s*(.+)$/);
      if (idMatch) {
        targetId = idMatch[1].trim();
      }
    }
    
    if (!targetId) {
      return undefined;
    }
    
    // Get all references to this section
    const occurrences = indexStore.getOccurrencesTo(targetId);
    
    return occurrences.map(occ => new vscode.Location(occ.uri, occ.range));
  }
}

/**
 * Registers the reference provider
 */
export function registerReferenceProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerReferenceProvider('markdown', new WeaveReferenceProvider())
  );
}
