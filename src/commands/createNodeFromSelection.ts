import * as vscode from 'vscode';

/**
 * Validates that a node ID contains only alphanumeric characters and hyphens
 */
function validateNodeId(id: string): string | null {
  if (!id || id.trim().length === 0) {
    return 'Node ID cannot be empty';
  }
  
  // Remove leading/trailing whitespace for validation
  const trimmedId = id.trim();
  
  // Check if ID contains only alphanumeric characters and hyphens
  if (!/^[a-zA-Z0-9-]+$/.test(trimmedId)) {
    return 'Node ID can only contain letters, numbers, and hyphens (-)';
  }
  
  // Check if ID starts or ends with a hyphen
  if (trimmedId.startsWith('-') || trimmedId.endsWith('-')) {
    return 'Node ID cannot start or end with a hyphen';
  }
  
  // Check for consecutive hyphens
  if (trimmedId.includes('--')) {
    return 'Node ID cannot contain consecutive hyphens';
  }
  
  return null; // No validation error
}

/**
 * Creates the frontmatter and content for a new node file
 */
function createNodeContent(id: string, title: string, selectedText: string): string {
  return `---
id: ${id}
title: ${title}
---

${selectedText}
`;
}

/**
 * Creates the link text to replace the selection
 */
function createLinkText(id: string, displayText: string, linkFormat: string, nodeDirectory: string): string {
  if (linkFormat === 'markdown') {
    return `[${displayText}](./${nodeDirectory}/${id}.md)`;
  }
  // Default to weave format
  return `[${displayText}](node:${id})`;
}

/**
 * Command: Create Node from Selection
 * 
 * Takes the selected text, creates a new node file with it,
 * and replaces the selection with a link to the new node.
 */
export async function createNodeFromSelectionCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  // Guard: No active editor
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);

  // Guard: Empty selection
  if (!selectedText || selectedText.trim().length === 0) {
    vscode.window.showInformationMessage('Please select some text to create a node from');
    return;
  }

  // Get configuration
  const config = vscode.workspace.getConfiguration('weave');
  const nodeDirectory = config.get<string>('nodeDirectory', 'sections');
  const linkFormat = config.get<string>('nodeLinkFormat', 'weave');

  // Get workspace folder
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder found');
    return;
  }

  // Prompt user for node ID
  const nodeId = await vscode.window.showInputBox({
    prompt: 'Enter a node ID',
    placeHolder: 'my-node-id',
    validateInput: (value) => validateNodeId(value)
  });

  // Guard: User cancelled the prompt
  if (!nodeId) {
    return;
  }

  // Use the validated and trimmed ID
  const id = nodeId.trim();

  // Resolve target directory and file path
  const targetDir = vscode.Uri.joinPath(workspaceFolder.uri, nodeDirectory);
  const targetFile = vscode.Uri.joinPath(targetDir, `${id}.md`);

  // Check if file already exists (unlikely with random ID, but be safe)
  try {
    await vscode.workspace.fs.stat(targetFile);
    vscode.window.showErrorMessage(`File ${id}.md already exists. Please try again.`);
    return;
  } catch {
    // File doesn't exist, which is what we want
  }

  // For now, use the ID as the title
  const title = id;

  // Create the node content
  const nodeContent = createNodeContent(id, title, selectedText.trim());

  // Create the link text using the title as display text
  const linkText = createLinkText(id, title, linkFormat, nodeDirectory);

  let fileCreated = false;

  try {
    // Ensure directory exists
    try {
      await vscode.workspace.fs.stat(targetDir);
    } catch {
      await vscode.workspace.fs.createDirectory(targetDir);
    }

    // Create the file
    await vscode.workspace.fs.writeFile(targetFile, Buffer.from(nodeContent, 'utf8'));
    fileCreated = true;

    // Replace selection with link using WorkspaceEdit (undoable)
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(editor.document.uri, selection, linkText);
    const editSuccess = await vscode.workspace.applyEdit(workspaceEdit);

    if (!editSuccess) {
      throw new Error('Failed to replace selection with link');
    }

    // Show success message with action to open the new node
    const action = await vscode.window.showInformationMessage(
      `Created node: ${id}.md`,
      'Open Node'
    );

    if (action === 'Open Node') {
      const doc = await vscode.workspace.openTextDocument(targetFile);
      await vscode.window.showTextDocument(doc);
    }

  } catch (error) {
    // Rollback: delete file if it was created
    if (fileCreated) {
      try {
        await vscode.workspace.fs.delete(targetFile);
      } catch {
        // Ignore rollback errors
      }
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Failed to create node: ${message}`);
  }
}

/**
 * Registers the create node from selection command
 */
export function registerCreateNodeFromSelectionCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('weave.createNodeFromSelection', createNodeFromSelectionCommand)
  );
}
