import * as vscode from 'vscode';
import { getIndexStore } from '../validation/indexStore';
import { parseNodeUrl } from '../validation/lightweightValidator';

/**
 * Document link provider for Weave node: links
 * Intercepts node: URLs so VS Code doesn't try to resolve them as external URLs
 */
export class WeaveDocumentLinkProvider implements vscode.DocumentLinkProvider {
  
  provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    const text = document.getText();
    const indexStore = getIndexStore();
    
    // Match markdown links with node: URLs: [text](node:id?params)
    const linkRegex = /\[([^\]]*)\]\((node:[\w-]+(?:\?[^)\s]*)?)\)/g;
    let match;
    
    while ((match = linkRegex.exec(text)) !== null) {
      const nodeUrl = match[2];
      const parsed = parseNodeUrl(nodeUrl);
      
      // Still create links even if params are invalid (parsed.id will exist)
      if (!parsed) continue;
      const section = indexStore.getSectionById(parsed.id);
      
      // Calculate range for just the URL part (inside parentheses)
      const urlStart = match.index + match[0].indexOf('(') + 1;
      const urlEnd = urlStart + nodeUrl.length;
      const startPos = document.positionAt(urlStart);
      const endPos = document.positionAt(urlEnd);
      const range = new vscode.Range(startPos, endPos);
      
      if (section) {
        // Valid section - link to its location
        const targetLine = section.frontmatterRange?.start.line ?? 0;
        const targetUri = section.uri.with({
          fragment: `L${targetLine + 1}`
        });
        
        const link = new vscode.DocumentLink(range, targetUri);
        link.tooltip = section.title || section.peek || `Go to ${parsed.id}`;
        links.push(link);
      } else {
        // Unknown section - still create a link to prevent VS Code's default handler
        // but with no target (will show error on click)
        const link = new vscode.DocumentLink(range);
        link.tooltip = `Section "${parsed.id}" not found`;
        links.push(link);
      }
    }
    
    return links;
  }

  resolveDocumentLink(
    link: vscode.DocumentLink,
    _token: vscode.CancellationToken
  ): vscode.DocumentLink | undefined {
    // If link has no target, show error message
    if (!link.target) {
      vscode.window.showWarningMessage(`Cannot navigate: ${link.tooltip}`);
      return undefined;
    }
    return link;
  }
}

/**
 * Registers the document link provider
 */
export function registerDocumentLinkProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider('markdown', new WeaveDocumentLinkProvider())
  );
}
