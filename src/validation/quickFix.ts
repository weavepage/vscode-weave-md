import * as vscode from 'vscode';
import * as path from 'path';
import { WeaveDiagnosticCode } from './diagnosticsProvider';

/**
 * Code action provider for Weave quick fixes
 */
export class WeaveCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== 'weave') {
        continue;
      }

      switch (diagnostic.code) {
        case WeaveDiagnosticCode.MISSING_TARGET:
          actions.push(...this.createMissingSectionFixes(document, diagnostic));
          break;
        case WeaveDiagnosticCode.UNKNOWN_PARAMS:
          actions.push(...this.createRemoveUnknownParamsFix(document, diagnostic));
          break;
        case WeaveDiagnosticCode.MISSING_FRONTMATTER:
          actions.push(...this.createAddFrontmatterFix(document, diagnostic));
          break;
      }
    }

    return actions;
  }

  /**
   * Creates a fix to create a missing section file
   */
  private createMissingSectionFixes(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    
    // Extract section ID from diagnostic message
    const match = diagnostic.message.match(/Section "([^"]+)" not found/);
    if (!match) {
      return actions;
    }
    
    const sectionId = match[1];
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    
    if (!workspaceFolder) {
      return actions;
    }

    // Create action to generate section file
    const createAction = new vscode.CodeAction(
      `Create section file for "${sectionId}"`,
      vscode.CodeActionKind.QuickFix
    );
    
    const sectionsDir = path.join(workspaceFolder.uri.fsPath, 'sections');
    const newFilePath = path.join(sectionsDir, `${sectionId}.md`);
    const newFileUri = vscode.Uri.file(newFilePath);
    
    const frontmatter = `---
id: ${sectionId}
title: ${sectionId}
peek: ""
---

`;

    const edit = new vscode.WorkspaceEdit();
    edit.createFile(newFileUri, { ignoreIfExists: true });
    edit.insert(newFileUri, new vscode.Position(0, 0), frontmatter);
    
    createAction.edit = edit;
    createAction.diagnostics = [diagnostic];
    createAction.isPreferred = true;
    
    actions.push(createAction);
    
    return actions;
  }

  /**
   * Creates a fix to remove unknown parameters from node: URL
   */
  private createRemoveUnknownParamsFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    
    const linkText = document.getText(diagnostic.range);
    const match = linkText.match(/\[([^\]]*)\]\((node:[^)]+)\)/);
    
    if (!match) {
      return actions;
    }
    
    const linkLabel = match[1];
    const nodeUrl = match[2];
    
    // Parse and rebuild URL without unknown params
    const [idPart, queryString] = nodeUrl.slice(5).split('?');
    if (!queryString) {
      return actions;
    }
    
    const params = new URLSearchParams(queryString);
    const knownParams = new URLSearchParams();
    
    for (const [key, value] of params) {
      if (key === 'display' || key === 'export') {
        knownParams.set(key, value);
      }
    }
    
    let newUrl = `node:${idPart}`;
    const knownParamsString = knownParams.toString();
    if (knownParamsString) {
      newUrl += `?${knownParamsString}`;
    }
    
    const newLinkText = `[${linkLabel}](${newUrl})`;
    
    const removeAction = new vscode.CodeAction(
      'Remove unknown parameters',
      vscode.CodeActionKind.QuickFix
    );
    
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, diagnostic.range, newLinkText);
    
    removeAction.edit = edit;
    removeAction.diagnostics = [diagnostic];
    
    actions.push(removeAction);
    
    return actions;
  }

  /**
   * Creates a fix to add frontmatter to a document
   */
  private createAddFrontmatterFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    
    // Generate a default ID from filename
    const filename = path.basename(document.uri.fsPath, '.md');
    const defaultId = filename.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    
    const frontmatter = `---
id: ${defaultId}
title: "${filename}"
peek: ""
---

`;

    const addAction = new vscode.CodeAction(
      'Add Weave frontmatter',
      vscode.CodeActionKind.QuickFix
    );
    
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, new vscode.Position(0, 0), frontmatter);
    
    addAction.edit = edit;
    addAction.diagnostics = [diagnostic];
    addAction.isPreferred = true;
    
    actions.push(addAction);
    
    return actions;
  }
}
