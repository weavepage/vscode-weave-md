import * as vscode from 'vscode';

/**
 * Section metadata extracted from frontmatter
 */
export interface Section {
  id: string;
  title?: string;
  peek?: string;
  uri: vscode.Uri;
  bodyMarkdown: string;
  fullMarkdown: string; // Complete document including frontmatter
  frontmatterRange?: vscode.Range;
}

/**
 * Reference occurrence in a document
 */
export interface ReferenceOccurrence {
  fromId: string;
  toId: string;
  uri: vscode.Uri;
  range: vscode.Range;
  rawHref: string;
}

/**
 * Per-file index containing sections and references
 */
export interface FileIndex {
  uri: vscode.Uri;
  sections: Section[];
  references: ReferenceOccurrence[];
  lastModified: number;
}

/**
 * Centralized store for workspace indices
 */
export class IndexStore {
  private fileIndexByUri: Map<string, FileIndex> = new Map();
  private sectionsById: Map<string, Section> = new Map();
  private incomingRefs: Map<string, Map<string, number>> = new Map();
  private outgoingRefs: Map<string, Map<string, number>> = new Map();

  private _onDidUpdateIndex = new vscode.EventEmitter<void>();
  public readonly onDidUpdateIndex = this._onDidUpdateIndex.event;

  /**
   * Updates the index for a single file
   */
  public updateFileIndex(uri: vscode.Uri, sections: Section[], references: ReferenceOccurrence[]): void {
    const key = uri.toString();
    
    this.fileIndexByUri.set(key, {
      uri,
      sections,
      references,
      lastModified: Date.now()
    });

    this.rebuildDerivedMaps();
    this._onDidUpdateIndex.fire();
  }

  /**
   * Removes a file from the index
   */
  public removeFileIndex(uri: vscode.Uri): void {
    const key = uri.toString();
    if (this.fileIndexByUri.has(key)) {
      this.fileIndexByUri.delete(key);
      this.rebuildDerivedMaps();
      this._onDidUpdateIndex.fire();
    }
  }

  /**
   * Gets a section by ID
   */
  public getSectionById(id: string): Section | undefined {
    return this.sectionsById.get(id);
  }

  /**
   * Gets all section IDs
   */
  public getSectionIds(): string[] {
    return Array.from(this.sectionsById.keys());
  }

  /**
   * Gets all sections (deduplicated by ID - returns one section per ID)
   */
  public getAllSections(): Section[] {
    return Array.from(this.sectionsById.values());
  }

  /**
   * Gets all sections including duplicates (for duplicate ID detection)
   */
  public getAllSectionsIncludingDuplicates(): Section[] {
    const sections: Section[] = [];
    for (const fileIndex of this.fileIndexByUri.values()) {
      sections.push(...fileIndex.sections);
    }
    return sections;
  }

  /**
   * Gets incoming references to a section (backlinks)
   */
  public getIncomingRefs(toId: string): Map<string, number> {
    return this.incomingRefs.get(toId) || new Map();
  }

  /**
   * Gets outgoing references from a section
   */
  public getOutgoingRefs(fromId: string): Map<string, number> {
    return this.outgoingRefs.get(fromId) || new Map();
  }

  /**
   * Gets all reference occurrences
   */
  public getAllOccurrences(): ReferenceOccurrence[] {
    const occurrences: ReferenceOccurrence[] = [];
    for (const fileIndex of this.fileIndexByUri.values()) {
      occurrences.push(...fileIndex.references);
    }
    return occurrences;
  }

  /**
   * Gets occurrences pointing to a specific section
   */
  public getOccurrencesTo(toId: string): ReferenceOccurrence[] {
    return this.getAllOccurrences().filter(occ => occ.toId === toId);
  }

  /**
   * Gets the file index for a URI
   */
  public getFileIndex(uri: vscode.Uri): FileIndex | undefined {
    return this.fileIndexByUri.get(uri.toString());
  }

  /**
   * Checks if a file is indexed
   */
  public hasFile(uri: vscode.Uri): boolean {
    return this.fileIndexByUri.has(uri.toString());
  }

  /**
   * Clears all indices
   */
  public clear(): void {
    this.fileIndexByUri.clear();
    this.sectionsById.clear();
    this.incomingRefs.clear();
    this.outgoingRefs.clear();
    this._onDidUpdateIndex.fire();
  }

  /**
   * Rebuilds derived maps from per-file indices
   */
  private rebuildDerivedMaps(): void {
    this.sectionsById.clear();
    this.incomingRefs.clear();
    this.outgoingRefs.clear();

    for (const fileIndex of this.fileIndexByUri.values()) {
      for (const section of fileIndex.sections) {
        this.sectionsById.set(section.id, section);
      }

      for (const ref of fileIndex.references) {
        // Update outgoing refs
        if (!this.outgoingRefs.has(ref.fromId)) {
          this.outgoingRefs.set(ref.fromId, new Map());
        }
        const outgoing = this.outgoingRefs.get(ref.fromId)!;
        outgoing.set(ref.toId, (outgoing.get(ref.toId) || 0) + 1);

        // Update incoming refs
        if (!this.incomingRefs.has(ref.toId)) {
          this.incomingRefs.set(ref.toId, new Map());
        }
        const incoming = this.incomingRefs.get(ref.toId)!;
        incoming.set(ref.fromId, (incoming.get(ref.fromId) || 0) + 1);
      }
    }
  }

  public dispose(): void {
    this._onDidUpdateIndex.dispose();
  }
}

// Singleton instance
let indexStoreInstance: IndexStore | undefined;

export function getIndexStore(): IndexStore {
  if (!indexStoreInstance) {
    indexStoreInstance = new IndexStore();
  }
  return indexStoreInstance;
}

export function disposeIndexStore(): void {
  if (indexStoreInstance) {
    indexStoreInstance.dispose();
    indexStoreInstance = undefined;
  }
}
