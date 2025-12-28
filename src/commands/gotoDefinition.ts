import * as vscode from 'vscode';
import { getIndexStore } from '../validation/indexStore';
import { parseNodeUrl } from '../validation/lightweightValidator';

/**
 * Gets the node: URL at the current cursor position
 */
function getNodeUrlAtCursor(editor: vscode.TextEditor): { id: string; range: vscode.Range } | undefined {
  const document = editor.document;
  const position = editor.selection.active;
  
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

  return { id: parsed.id, range };
}

/**
 * Command: Go to Weave Section Definition
 */
export async function gotoDefinitionCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  const nodeUrl = getNodeUrlAtCursor(editor);
  
  if (!nodeUrl) {
    vscode.window.showWarningMessage('No Weave node: reference at cursor');
    return;
  }

  const indexStore = getIndexStore();
  const section = indexStore.getSectionById(nodeUrl.id);

  if (!section) {
    vscode.window.showWarningMessage(`Section "${nodeUrl.id}" not found`);
    return;
  }

  // Open the file and navigate to frontmatter
  const document = await vscode.workspace.openTextDocument(section.uri);
  const targetEditor = await vscode.window.showTextDocument(document);

  if (section.frontmatterRange) {
    targetEditor.selection = new vscode.Selection(
      section.frontmatterRange.start,
      section.frontmatterRange.start
    );
    targetEditor.revealRange(section.frontmatterRange, vscode.TextEditorRevealType.InCenter);
  }
}

/**
 * Registers the goto definition command
 */
export function registerGotoDefinitionCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('weave.gotoDefinition', gotoDefinitionCommand)
  );
}
