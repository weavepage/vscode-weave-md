import * as vscode from 'vscode';
import { parseWeaveDocument, WeaveParseError, WeaveDiagnosticsError, Diagnostic as WeaveDiagnostic } from '@weave-md/parse';
import { validateWeaveBlocks, validateInlineSyntax, validateInlineMath, validateInlineSubstitute } from '@weave-md/validate';

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
   * Performs full AST validation on a document using @weave-md/parse
   */
  public validate(document: vscode.TextDocument): void {
    const text = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];

    try {
      const result = parseWeaveDocument(text, { filePath: document.uri.fsPath });
      
      // Convert any diagnostics from the parse result
      if (result.diagnostics) {
        for (const diag of result.diagnostics) {
          diagnostics.push(this.toVscodeDiagnostic(diag));
        }
      }

      // Additional validation using @weave-md/validate functions
      const blockDiagnostics = validateWeaveBlocks(text, document.uri.fsPath);
      for (const diag of blockDiagnostics) {
        diagnostics.push(this.toVscodeDiagnostic(diag));
      }

      const inlineDiagnostics = validateInlineSyntax(text, document.uri.fsPath);
      for (const diag of inlineDiagnostics) {
        diagnostics.push(this.toVscodeDiagnostic(diag));
      }

      const mathDiagnostics = validateInlineMath(text, document.uri.fsPath);
      for (const diag of mathDiagnostics) {
        diagnostics.push(this.toVscodeDiagnostic(diag));
      }

      const subDiagnostics = validateInlineSubstitute(text, document.uri.fsPath);
      for (const diag of subDiagnostics) {
        diagnostics.push(this.toVscodeDiagnostic(diag));
      }

    } catch (error) {
      if (error instanceof WeaveParseError) {
        diagnostics.push(new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          error.message,
          vscode.DiagnosticSeverity.Error
        ));
      } else if (error instanceof WeaveDiagnosticsError) {
        for (const diag of error.diagnostics) {
          diagnostics.push(this.toVscodeDiagnostic(diag));
        }
      } else {
        console.error('Unexpected error during AST validation:', error);
      }
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
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
  private toVscodeDiagnostic(diag: WeaveDiagnostic): vscode.Diagnostic {
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
