import * as vscode from 'vscode';
import { getIndexStore } from './indexStore';
import { DisplayType, ExportHint } from '@weave-md/core';
import { VALID_DISPLAY_MODES, VALID_EXPORT_HINTS } from '../util/displayTypes';

/**
 * Diagnostic codes for Weave validation errors
 */
export enum WeaveDiagnosticCode {
  MISSING_FRONTMATTER = 'WEAVE001',
  INVALID_FRONTMATTER = 'WEAVE002',
  MISSING_ID = 'WEAVE003',
  DUPLICATE_ID = 'WEAVE004',
  MISSING_TARGET = 'WEAVE005',
  INVALID_NODE_URL = 'WEAVE006',
  UNKNOWN_PARAMS = 'WEAVE007',
  INVALID_DISPLAY = 'WEAVE008',
  INVALID_EXPORT = 'WEAVE009'
}

/**
 * Creates a diagnostic with a Weave-specific code
 */
export function createWeaveDiagnostic(
  range: vscode.Range,
  message: string,
  severity: vscode.DiagnosticSeverity,
  code: WeaveDiagnosticCode
): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(range, message, severity);
  diagnostic.code = code;
  diagnostic.source = 'weave';
  return diagnostic;
}

/**
 * Checks for duplicate section IDs across the workspace
 */
export function checkDuplicateIds(): Map<string, vscode.Diagnostic[]> {
  const indexStore = getIndexStore();
  const diagnosticsByUri = new Map<string, vscode.Diagnostic[]>();
  const idLocations = new Map<string, Array<{ uri: vscode.Uri; range?: vscode.Range }>>();

  // Collect all section ID locations (including duplicates)
  for (const section of indexStore.getAllSectionsIncludingDuplicates()) {
    if (!idLocations.has(section.id)) {
      idLocations.set(section.id, []);
    }
    idLocations.get(section.id)!.push({
      uri: section.uri,
      range: section.frontmatterRange
    });
  }

  // Find duplicates and group by URI
  for (const [id, locations] of idLocations) {
    if (locations.length > 1) {
      for (const loc of locations) {
        const range = loc.range || new vscode.Range(0, 0, 0, 0);
        const diagnostic = createWeaveDiagnostic(
          range,
          `Duplicate section ID "${id}" found in ${locations.length} files`,
          vscode.DiagnosticSeverity.Error,
          WeaveDiagnosticCode.DUPLICATE_ID
        );
        
        const uriKey = loc.uri.toString();
        if (!diagnosticsByUri.has(uriKey)) {
          diagnosticsByUri.set(uriKey, []);
        }
        diagnosticsByUri.get(uriKey)!.push(diagnostic);
      }
    }
  }

  return diagnosticsByUri;
}

/**
 * Checks for missing target sections in references
 */
export function checkMissingTargets(): Map<string, vscode.Diagnostic[]> {
  const indexStore = getIndexStore();
  const diagnosticsByUri = new Map<string, vscode.Diagnostic[]>();
  const allOccurrences = indexStore.getAllOccurrences();

  for (const occ of allOccurrences) {
    const targetSection = indexStore.getSectionById(occ.toId);
    if (!targetSection) {
      const uriKey = occ.uri.toString();
      if (!diagnosticsByUri.has(uriKey)) {
        diagnosticsByUri.set(uriKey, []);
      }
      diagnosticsByUri.get(uriKey)!.push(createWeaveDiagnostic(
        occ.range,
        `Section "${occ.toId}" not found`,
        vscode.DiagnosticSeverity.Error,
        WeaveDiagnosticCode.MISSING_TARGET
      ));
    }
  }

  return diagnosticsByUri;
}

/**
 * Diagnostics provider that manages workspace-wide diagnostics
 */
export class DiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('weave-workspace');

    // Listen for index updates to refresh workspace diagnostics
    const indexStore = getIndexStore();
    this.disposables.push(
      indexStore.onDidUpdateIndex(() => this.refreshWorkspaceDiagnostics())
    );
  }

  /**
   * Refreshes workspace-wide diagnostics (duplicate IDs, missing targets)
   */
  public refreshWorkspaceDiagnostics(): void {
    // Clear existing workspace diagnostics
    this.diagnosticCollection.clear();

    // Check for missing targets
    const missingTargetDiagnostics = checkMissingTargets();
    for (const [uriString, diagnostics] of missingTargetDiagnostics) {
      const uri = vscode.Uri.parse(uriString);
      const existing = this.diagnosticCollection.get(uri) || [];
      this.diagnosticCollection.set(uri, [...existing, ...diagnostics]);
    }

    // Check for duplicate IDs
    const duplicateDiagnostics = checkDuplicateIds();
    
    // Apply duplicate ID diagnostics (already grouped by URI)
    for (const [uriString, diagnostics] of duplicateDiagnostics) {
      const uri = vscode.Uri.parse(uriString);
      const existing = this.diagnosticCollection.get(uri) || [];
      this.diagnosticCollection.set(uri, [...existing, ...diagnostics]);
    }
  }

  /**
   * Gets all diagnostics for a URI
   */
  public getDiagnostics(uri: vscode.Uri): readonly vscode.Diagnostic[] {
    return this.diagnosticCollection.get(uri) || [];
  }

  public dispose(): void {
    this.diagnosticCollection.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
