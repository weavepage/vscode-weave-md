import * as vscode from 'vscode';
import { getIndexStore } from '../validation/indexStore';
import { parseNodeUrl } from '../validation/lightweightValidator';

/**
 * Definition provider for Weave documents
 */
export class WeaveDefinitionProvider implements vscode.DefinitionProvider {
  
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.Location | undefined {
    // Match node: URLs including hyphens and query params
    const range = document.getWordRangeAtPosition(
      position,
      /node:[\w-]+(?:\?[^)\]\s]*)?/
    );

    if (!range) {
      return undefined;
    }

    const text = document.getText(range);
    const parsed = parseNodeUrl(text);

    if (!parsed) {
      return undefined;
    }

    const indexStore = getIndexStore();
    const section = indexStore.getSectionById(parsed.id);

    if (!section) {
      return undefined;
    }

    // Return location at frontmatter if available, otherwise start of file
    const targetRange = section.frontmatterRange || new vscode.Range(0, 0, 0, 0);
    return new vscode.Location(section.uri, targetRange);
  }
}

/**
 * Registers the definition provider
 */
export function registerDefinitionProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider('markdown', new WeaveDefinitionProvider())
  );
}
