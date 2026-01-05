import * as vscode from 'vscode';
import { Section, ReferenceOccurrence, getIndexStore } from './indexStore';
import { parseNodeUrl as coreParseNodeUrl, DisplayType, Diagnostic as WeaveDiagnostic } from '@weave-md/core';
import { parseFrontmatter, extractNodeLinks } from '@weave-md/validate';

/**
 * Converts a @weave-md/core Diagnostic to VS Code Diagnostic
 */
function toVscodeDiagnostic(diag: WeaveDiagnostic): vscode.Diagnostic {
  const pos = diag.position 
    ? new vscode.Position(diag.position.line - 1, diag.position.character) 
    : new vscode.Position(0, 0);
  const severity = diag.severity === 'error' 
    ? vscode.DiagnosticSeverity.Error
    : diag.severity === 'warning' 
    ? vscode.DiagnosticSeverity.Warning
    : vscode.DiagnosticSeverity.Information;
  return new vscode.Diagnostic(new vscode.Range(pos, pos), diag.message, severity);
}

/**
 * Parsed node: URL structure (re-exported from @weave-md/core)
 */
export interface ParsedNodeUrl {
  id: string;
  display?: DisplayType;
  export?: 'appendix' | 'inline' | 'omit';
  unknownParams: Map<string, string>;
}

/**
 * Validation result for a document
 */
export interface ValidationResult {
  sections: Section[];
  references: ReferenceOccurrence[];
  diagnostics: vscode.Diagnostic[];
}

/**
 * Parses a node: URL and extracts its components using @weave-md/core
 * Returns null only if the URL doesn't start with node: or has no ID
 */
export function parseNodeUrl(href: string): ParsedNodeUrl | null {
  const parseResult = coreParseNodeUrl(href);
  
  if (parseResult.success) {
    const ref = parseResult.ref;
    const unknownParams = new Map<string, string>();
    
    // Collect unknown params (any key that's not id, display, or export)
    for (const [key, value] of Object.entries(ref)) {
      if (key !== 'id' && key !== 'display' && key !== 'export' && value !== undefined) {
        unknownParams.set(key, String(value));
      }
    }

    return {
      id: ref.id,
      display: ref.display,
      export: ref.export,
      unknownParams
    };
  }
  
  // Fallback: extract ID even if params are invalid (for navigation)
  if (href.startsWith('node:')) {
    const urlStr = href.slice(5);
    const [id] = urlStr.split('?');
    if (id) {
      return {
        id,
        display: undefined,
        export: undefined,
        unknownParams: new Map()
      };
    }
  }
  
  return null;
}

/**
 * Extracts frontmatter from markdown content using @weave-md/validate
 */
export function extractFrontmatter(content: string): { frontmatter: Record<string, unknown> | null; bodyStart: number; frontmatterRange?: { start: number; end: number }; diagnostics: WeaveDiagnostic[] } {
  const result = parseFrontmatter(content);
  
  if (!result.frontmatter) {
    return { frontmatter: null, bodyStart: 0, diagnostics: result.diagnostics };
  }

  const bodyStart = content.length - result.body.length;
  return {
    frontmatter: result.frontmatter,
    bodyStart,
    frontmatterRange: { start: 0, end: bodyStart },
    diagnostics: result.diagnostics
  };
}

/**
 * Finds all node: links in a document with their ranges using @weave-md/validate
 */
export function findNodeLinks(document: vscode.TextDocument): { links: Array<{ targetId: string; range: vscode.Range; rawHref: string; parsed: ParsedNodeUrl }>; diagnostics: WeaveDiagnostic[] } {
  const text = document.getText();
  const result = extractNodeLinks(text, document.uri.fsPath);
  
  const links: Array<{ targetId: string; range: vscode.Range; rawHref: string; parsed: ParsedNodeUrl }> = [];
  
  for (const link of result.links) {
    const startPos = new vscode.Position(link.start.line - 1, link.start.character);
    const endPos = new vscode.Position(link.end.line - 1, link.end.character);
    const range = new vscode.Range(startPos, endPos);
    
    // Convert NodeRef to ParsedNodeUrl format
    const unknownParams = new Map<string, string>();
    for (const [key, value] of Object.entries(link.ref)) {
      if (key !== 'id' && key !== 'display' && key !== 'export' && value !== undefined) {
        unknownParams.set(key, String(value));
      }
    }
    
    links.push({
      targetId: link.ref.id,
      range,
      rawHref: `node:${link.ref.id}`,
      parsed: {
        id: link.ref.id,
        display: link.ref.display,
        export: link.ref.export,
        unknownParams
      }
    });
  }

  return { links, diagnostics: result.errors };
}

/**
 * Checks if a position is within frontmatter
 */
export function isInFrontmatter(document: vscode.TextDocument, position: vscode.Position): boolean {
  const text = document.getText();
  const offset = document.offsetAt(position);
  
  if (!text.startsWith('---')) {
    return false;
  }

  const endMatch = text.indexOf('\n---', 3);
  if (endMatch === -1) {
    return false;
  }

  return offset >= 0 && offset <= endMatch + 4;
}

/**
 * Validates a single document and returns validation results
 */
export function validateDocument(document: vscode.TextDocument): ValidationResult {
  const diagnostics: vscode.Diagnostic[] = [];
  const sections: Section[] = [];
  const references: ReferenceOccurrence[] = [];
  const text = document.getText();

  // Extract frontmatter
  const { frontmatter, bodyStart, frontmatterRange, diagnostics: fmDiagnostics } = extractFrontmatter(text);
  
  // Convert weave diagnostics to VS Code diagnostics
  for (const diag of fmDiagnostics) {
    diagnostics.push(toVscodeDiagnostic(diag));
  }

  // Check for missing frontmatter
  if (!frontmatter) {
    if (!text.startsWith('---')) {
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 0),
        'Weave section files should start with YAML frontmatter',
        vscode.DiagnosticSeverity.Warning
      ));
    } else {
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 3),
        'Invalid YAML frontmatter',
        vscode.DiagnosticSeverity.Error
      ));
    }
  } else {
    // Check for required 'id' field
    if (!frontmatter.id || typeof frontmatter.id !== 'string') {
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 3),
        'Weave section requires an "id" field in frontmatter',
        vscode.DiagnosticSeverity.Error
      ));
    } else {
      // Create section from frontmatter
      const bodyMarkdown = text.slice(bodyStart);
      const fmRange = frontmatterRange 
        ? new vscode.Range(
            document.positionAt(frontmatterRange.start),
            document.positionAt(frontmatterRange.end)
          )
        : undefined;

      sections.push({
        id: frontmatter.id as string,
        title: frontmatter.title as string | undefined,
        peek: frontmatter.peek as string | undefined,
        uri: document.uri,
        bodyMarkdown,
        fullMarkdown: text,
        frontmatterRange: fmRange
      });
    }
  }

  // Find and validate node: links
  const { links: nodeLinks, diagnostics: linkDiagnostics } = findNodeLinks(document);
  const indexStore = getIndexStore();
  const currentSectionId = frontmatter?.id as string || 'main';

  // Convert link diagnostics to VS Code diagnostics
  for (const diag of linkDiagnostics) {
    diagnostics.push(toVscodeDiagnostic(diag));
  }

  for (const link of nodeLinks) {
    references.push({
      fromId: currentSectionId,
      toId: link.targetId,
      uri: document.uri,
      range: link.range,
      rawHref: link.rawHref
    });

    // Check for unknown parameters
    if (link.parsed.unknownParams.size > 0) {
      const unknownKeys = Array.from(link.parsed.unknownParams.keys()).join(', ');
      const config = vscode.workspace.getConfiguration('weave');
      const strict = config.get<boolean>('strictNodeParams', false);
      diagnostics.push(new vscode.Diagnostic(
        link.range,
        `Unknown node: URL parameters: ${unknownKeys}`,
        strict ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information
      ));
    }

    // Check for invalid display values
    if (link.parsed.display) {
      const validDisplayValues = ['inline', 'stretch', 'overlay', 'footnote', 'sidenote', 'margin', 'page'];
      if (!validDisplayValues.includes(link.parsed.display)) {
        diagnostics.push(new vscode.Diagnostic(
          link.range,
          `Invalid display value: "${link.parsed.display}". Valid values: ${validDisplayValues.join(', ')}`,
          vscode.DiagnosticSeverity.Error
        ));
      }
    }

    // Note: Cross-reference validation is deferred to DiagnosticsProvider
    // which runs after all files are indexed
  }

  return { sections, references, diagnostics };
}

/**
 * Lightweight validator class that manages document validation
 */
export class LightweightValidator {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('weave');
  }

  /**
   * Validates a document and updates diagnostics
   */
  public validate(document: vscode.TextDocument): void {
    if (document.languageId !== 'markdown') {
      return;
    }

    const result = validateDocument(document);
    const indexStore = getIndexStore();

    // Update the index store
    indexStore.updateFileIndex(document.uri, result.sections, result.references);

    // Update diagnostics
    this.diagnosticCollection.set(document.uri, result.diagnostics);
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
