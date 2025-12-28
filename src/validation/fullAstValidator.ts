import * as vscode from 'vscode';
import { getIndexStore } from './indexStore';
// Temporarily commenting out ES module imports until we find a solution
// import { parseWeaveDocument, WeaveParseError } from '@weave-md/parse';
// import { Diagnostic as WeaveDiagnostic, DiagnosticSeverity } from '@weave-md/core';

/**
 * Full AST Validator using @weave-md/parse for comprehensive validation
 * Available via command or automatic triggers (save, periodic)
 */
export class FullAstValidator {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('weave-ast');
  }

  /**
   * Performs full AST validation on a document
   */
  public validate(document: vscode.TextDocument): void {
    // TODO: Implement full AST validation once ES module import issue is resolved
    // For now, just clear any existing diagnostics
    this.diagnosticCollection.set(document.uri, []);
  }

  /**
   * Validates all documents in the workspace
   */
  public async validateWorkspace(): Promise<void> {
    const config = vscode.workspace.getConfiguration('weave');
    const sectionsGlob = config.get<string>('sectionsGlob', 'sections/**/*.md');
    const rootFile = config.get<string>('rootFile', 'main.md');

    const rootFiles = await vscode.workspace.findFiles(rootFile);
    const sectionFiles = await vscode.workspace.findFiles(sectionsGlob);
    const allFiles = [...rootFiles, ...sectionFiles];

    for (const uri of allFiles) {
      try {
        const document = await vscode.workspace.openTextDocument(uri);
        this.validate(document);
      } catch (error) {
        console.error(`Error validating ${uri.fsPath}:`, error);
      }
    }
  }

  /**
   * Converts a @weave-md/core Diagnostic to VS Code Diagnostic
   */
  private toVscodeDiagnostic(diag: any): vscode.Diagnostic {
    const line = diag.position?.line ?? 1;
    const char = diag.position?.character ?? 0;
    const startPos = new vscode.Position(line - 1, char);
    
    const severity = diag.severity === 'error'
      ? vscode.DiagnosticSeverity.Error
      : diag.severity === 'warning'
      ? vscode.DiagnosticSeverity.Warning
      : vscode.DiagnosticSeverity.Information;

    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(startPos, startPos),
      diag.message,
      severity
    );
    diagnostic.code = diag.code;
    diagnostic.source = 'weave-ast';

    return diagnostic;
  }

  /**
   * Clears diagnostics for a document
   */
  public clearDiagnostics(uri: vscode.Uri): void {
    this.diagnosticCollection.delete(uri);
  }

  /**
   * Gets the diagnostic collection
   */
  public getDiagnosticCollection(): vscode.DiagnosticCollection {
    return this.diagnosticCollection;
  }

  public dispose(): void {
    this.diagnosticCollection.dispose();
  }
}
