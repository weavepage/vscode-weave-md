import * as vscode from 'vscode';
import { getIndexStore } from '../validation/indexStore';
import { config } from '../config';
import { parseNodeUrl } from '../validation/lightweightValidator';

/**
 * Command: Peek Weave Section
 * Shows a quick pick with section preview
 */
export async function peekSectionCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  const document = editor.document;
  const position = editor.selection.active;
  
  // Try to find node: URL at cursor
  const range = document.getWordRangeAtPosition(
    position,
    /node:[\w-]+(?:\?[^)\]\s]*)?/
  );

  let sectionId: string | undefined;

  if (range) {
    const text = document.getText(range);
    const parsed = parseNodeUrl(text);
    if (parsed) {
      sectionId = parsed.id;
    }
  }

  // If no section at cursor, show picker with all sections
  if (!sectionId) {
    const indexStore = getIndexStore();
    const sections = indexStore.getAllSections();

    if (sections.length === 0) {
      vscode.window.showInformationMessage('No Weave sections found in workspace');
      return;
    }

    const { peekMaxChars } = config.get();

    const items = sections.map(section => ({
      label: section.title || section.id,
      description: section.id,
      detail: truncateText(section.peek || section.bodyMarkdown, peekMaxChars),
      section
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a section to peek',
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (selected) {
      sectionId = selected.section.id;
    } else {
      return;
    }
  }

  // Show the section preview
  const indexStore = getIndexStore();
  const section = indexStore.getSectionById(sectionId!);

  if (!section) {
    vscode.window.showWarningMessage(`Section "${sectionId}" not found`);
    return;
  }

  const { peekMaxChars } = config.get();

  // Show in a hover-like information message with option to open
  const openAction = 'Open Section';
  const result = await vscode.window.showInformationMessage(
    `**${section.title || section.id}**\n\n${truncateText(section.peek || section.bodyMarkdown, peekMaxChars)}`,
    openAction
  );

  if (result === openAction) {
    const doc = await vscode.workspace.openTextDocument(section.uri);
    await vscode.window.showTextDocument(doc);
  }
}

/**
 * Truncates text to a maximum length
 */
function truncateText(text: string, maxLength: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return cleaned.slice(0, maxLength - 3) + '...';
}

/**
 * Registers the peek section command
 */
export function registerPeekSectionCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('weave.peekSection', peekSectionCommand)
  );
}
