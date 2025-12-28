import * as vscode from 'vscode';
import { Section, ReferenceOccurrence, getIndexStore } from './indexStore';
// Note: Temporarily commenting out ES module imports until we find a solution
// import { parseNodeUrl as coreParseNodeUrl, NodeRef, DisplayType, ExportHint } from '@weave-md/core';
// import { parseFrontmatter, extractNodeLinks } from '@weave-md/validate';

/**
 * Parsed node: URL structure
 */
export interface ParsedNodeUrl {
  id: string;
  display?: 'footnote' | 'sidenote' | 'margin' | 'overlay' | 'inline' | 'stretch' | 'page';
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
 * Parses a node: URL and extracts its components
 */
export function parseNodeUrl(href: string): ParsedNodeUrl | null {
  if (!href.startsWith('node:')) {
    return null;
  }

  const withoutPrefix = href.slice(5);
  const [idPart, queryString] = withoutPrefix.split('?');
  
  if (!idPart) {
    return null;
  }

  const result: ParsedNodeUrl = {
    id: idPart,
    unknownParams: new Map()
  };

  if (queryString) {
    const params = new URLSearchParams(queryString);
    for (const [key, value] of params) {
      if (key === 'display') {
        result.display = value as any;
      } else if (key === 'export') {
        result.export = value as any;
      } else {
        result.unknownParams.set(key, value);
      }
    }
  }

  return result;
}

/**
 * Extracts frontmatter from markdown content
 */
export function extractFrontmatter(content: string): { frontmatter: Record<string, unknown> | null; bodyStart: number; frontmatterRange?: { start: number; end: number } } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: null, bodyStart: 0 };
  }

  try {
    const yaml = require('yaml');
    const frontmatter = yaml.parse(match[1]) as Record<string, unknown>;
    const endIndex = match[0].length;
    return {
      frontmatter,
      bodyStart: endIndex,
      frontmatterRange: { start: 0, end: endIndex }
    };
  } catch {
    return { frontmatter: null, bodyStart: 0 };
  }
}

/**
 * Finds all node: links in a document with their ranges
 */
export function findNodeLinks(document: vscode.TextDocument): Array<{ targetId: string; range: vscode.Range; rawHref: string; parsed: ParsedNodeUrl }> {
  const links: Array<{ targetId: string; range: vscode.Range; rawHref: string; parsed: ParsedNodeUrl }> = [];
  const text = document.getText();
  
  // Match markdown links with node: URLs
  const linkRegex = /\[([^\]]*)\]\((node:[^)\s]+)\)/g;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    const rawHref = match[2];
    const parsed = parseNodeUrl(rawHref);
    
    if (parsed) {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      
      links.push({
        targetId: parsed.id,
        range: new vscode.Range(startPos, endPos),
        rawHref,
        parsed
      });
    }
  }

  return links;
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
  const { frontmatter, bodyStart, frontmatterRange } = extractFrontmatter(text);

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
        frontmatterRange: fmRange
      });
    }
  }

  // Find and validate node: links
  const nodeLinks = findNodeLinks(document);
  const indexStore = getIndexStore();
  const currentSectionId = frontmatter?.id as string || 'main';

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
      diagnostics.push(new vscode.Diagnostic(
        link.range,
        `Unknown node: URL parameters: ${unknownKeys}`,
        vscode.DiagnosticSeverity.Warning
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
