import * as vscode from 'vscode';
import { getIndexStore } from '../validation/indexStore';
import { parseNodeUrl } from '../validation/lightweightValidator';

/**
 * Hover provider for Weave documents
 */
export class WeaveHoverProvider implements vscode.HoverProvider {
  
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.Hover | undefined {
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
      return new vscode.Hover(
        new vscode.MarkdownString(`**Section not found:** \`${parsed.id}\``),
        range
      );
    }

    // Build hover content
    const content = new vscode.MarkdownString();
    
    if (section.title) {
      content.appendMarkdown(`**${section.title}**\n\n`);
    } else {
      content.appendMarkdown(`**${section.id}**\n\n`);
    }

    if (section.peek) {
      content.appendMarkdown(section.peek);
      content.appendMarkdown('\n\n');
    }

    // Add display mode info if present
    if (parsed.display) {
      content.appendMarkdown(`---\n*Display:* \`${parsed.display}\``);
    }

    // Add link to open file
    const fileUri = section.uri.toString();
    content.appendMarkdown(`\n\n[Open section](${fileUri})`);
    content.isTrusted = true;

    return new vscode.Hover(content, range);
  }
}

/**
 * Registers the hover provider
 */
export function registerHoverProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('markdown', new WeaveHoverProvider())
  );
}
