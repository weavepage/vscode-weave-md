/**
 * Shared types for Weave preview rendering
 */

import { DisplayType } from '@weave-md/core';

/**
 * Preview configuration from VS Code settings
 */
export interface PreviewConfig {
  enablePreviewEnhancements: boolean;
  maxPreviewDepth: number;
  maxExpandedCharsPerRef: number;
  maxExpandedRefsPerDoc: number;
  showPreviewLabels: boolean;
  sidenoteMinWidth: number;
}

/**
 * Parsed node: URL parameters
 */
export interface ParsedNodeUrl {
  id: string;
  display?: DisplayType;
  export?: string;
  unknownParams: Record<string, string>;
}

/**
 * Footnote entry for collection
 */
export interface FootnoteEntry {
  id: string;
  num: number;
  title: string;
  content: string;
  refIds: string[];
}

/**
 * Inline content entry for deferred rendering
 */
export interface InlineContentEntry {
  targetId: string;
  content: string;
}

/**
 * Render context for tracking expansion state
 */
export interface RenderContext {
  expandedRefs: number;
  expandedIds: Set<string>;
  footnoteCount: number;
  sidenoteCount: number;
  config: PreviewConfig;
  footnotes: Map<string, FootnoteEntry>;
  footnoteRefCount: number;
  inlineContents: InlineContentEntry[];
}
