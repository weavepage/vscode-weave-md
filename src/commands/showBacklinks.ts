import * as vscode from 'vscode';
import { getIndexStore } from '../validation/indexStore';
import { extractFrontmatter } from '../validation/lightweightValidator';

/**
 * Command: Show Backlinks (1 hop)
 * Shows incoming references to the current section
 */
export async function showBacklinksCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  const document = editor.document;
  
  // Get the current section ID from frontmatter
  const { frontmatter } = extractFrontmatter(document.getText());
  
  if (!frontmatter || !frontmatter.id) {
    vscode.window.showWarningMessage('Current file does not have a Weave section ID');
    return;
  }

  const sectionId = frontmatter.id as string;
  const indexStore = getIndexStore();
  
  // Get incoming references
  const occurrences = indexStore.getOccurrencesTo(sectionId);

  if (occurrences.length === 0) {
    vscode.window.showInformationMessage(`No backlinks found for section "${sectionId}"`);
    return;
  }

  // Build quick pick items
  const items = occurrences.map(occ => {
    const fromSection = indexStore.getSectionById(occ.fromId);
    return {
      label: fromSection?.title || occ.fromId,
      description: `from ${occ.fromId}`,
      detail: `Line ${occ.range.start.line + 1}: ${occ.rawHref}`,
      occurrence: occ
    };
  });

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `${occurrences.length} backlink(s) to "${sectionId}"`,
    matchOnDescription: true,
    matchOnDetail: true
  });

  if (selected) {
    // Open the file at the reference location
    const doc = await vscode.workspace.openTextDocument(selected.occurrence.uri);
    const targetEditor = await vscode.window.showTextDocument(doc);
    
    targetEditor.selection = new vscode.Selection(
      selected.occurrence.range.start,
      selected.occurrence.range.end
    );
    targetEditor.revealRange(selected.occurrence.range, vscode.TextEditorRevealType.InCenter);
  }
}

/**
 * Registers the show backlinks command
 */
export function registerShowBacklinksCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('weave.showBacklinks', showBacklinksCommand)
  );
}
