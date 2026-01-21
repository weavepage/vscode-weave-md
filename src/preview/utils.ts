/**
 * Shared utilities for Weave preview rendering
 */

import { DisplayType } from '@weave-md/core';
import { isValidDisplayType } from '../util/displayTypes';
import type { ParsedNodeUrl, PreviewConfig, RenderContext } from './types';
import { config } from '../config';

/**
 * Escapes HTML special characters
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parses a node: URL into its components
 */
export function parseNodeUrl(href: string): ParsedNodeUrl | null {
  if (!href.startsWith('node:')) {
    return null;
  }
  
  const withoutPrefix = href.slice(5);
  const [idPart, queryPart] = withoutPrefix.split('?');
  
  if (!idPart) {
    return null;
  }
  
  const result: ParsedNodeUrl = {
    id: idPart,
    unknownParams: {}
  };
  
  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    for (const [key, value] of params) {
      if (key === 'display') {
        if (isValidDisplayType(value)) {
          result.display = value as DisplayType;
        } else {
          result.unknownParams[key] = value;
        }
      } else if (key === 'export') {
        result.export = value;
      } else {
        result.unknownParams[key] = value;
      }
    }
  }
  
  return result;
}

/**
 * Parses YAML content from a fenced code block
 */
export function parseYamlBlock(content: string): Record<string, unknown> {
  try {
    const yaml = require('yaml');
    return yaml.parse(content) || {};
  } catch {
    return {};
  }
}

/**
 * Gets preview configuration from VS Code settings
 */
export function getPreviewConfig(): PreviewConfig {
  const cfg = config.get();
  return {
    enablePreviewEnhancements: cfg.enablePreviewEnhancements,
    maxPreviewDepth: cfg.maxPreviewDepth,
    maxExpandedCharsPerRef: cfg.maxExpandedCharsPerRef,
    maxExpandedRefsPerDoc: cfg.maxExpandedRefsPerDoc,
    showPreviewLabels: cfg.showPreviewLabels,
    sidenoteMinWidth: cfg.sidenoteMinWidth
  };
}

/**
 * Creates a new render context
 */
export function createRenderContext(): RenderContext {
  return {
    expandedRefs: 0,
    expandedIds: new Set(),
    footnoteCount: 0,
    sidenoteCount: 0,
    config: getPreviewConfig(),
    footnotes: new Map(),
    footnoteRefCount: 0,
    inlineContents: []
  };
}

/**
 * Checks if link text is anchor-only (empty or whitespace)
 */
export function isAnchorOnly(linkText: string): boolean {
  return !linkText || !linkText.trim() || linkText.trim() === '';
}

/**
 * Renders basic markdown content (simple paragraphs, text formatting)
 * Used for sidenotes and margin notes where full Weave parsing isn't needed
 */
export function renderBasicMarkdown(content: string): string {
  let html = content;
  
  const paragraphs = html.split(/\n\s*\n/).filter(p => p.trim());
  html = paragraphs.map(p => {
    p = p.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    p = p.replace(/\*(.*?)\*/g, '<em>$1</em>');
    p = p.replace(/`(.*?)`/g, '<code>$1</code>');
    p = p.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    return `<p>${p.trim()}</p>`;
  }).join('');
  
  if (paragraphs.length === 1 && !content.includes('\n\n')) {
    html = html.replace(/^<p>(.*?)<\/p>$/, '$1');
  }
  
  return html;
}

/**
 * Extracts content after YAML frontmatter for sidenote/margin note rendering
 */
export function extractContentAfterFrontmatter(fullMarkdown: string): string {
  const lines = fullMarkdown.split('\n');
  let inFrontmatter = false;
  let frontmatterEndIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (i === 0 && line === '---') {
      inFrontmatter = true;
      continue;
    }
    
    if (inFrontmatter && line === '---') {
      frontmatterEndIndex = i;
      break;
    }
  }
  
  if (frontmatterEndIndex >= 0) {
    return lines.slice(frontmatterEndIndex + 1).join('\n').trim();
  }
  
  return fullMarkdown.trim();
}

// SVG icons for anchor-only references
export const ICON_PLUS = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="weave-icon weave-icon-plus"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"></path></svg>';
export const ICON_MINUS = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="weave-icon weave-icon-minus"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"></path></svg>';
export const ICON_INFO = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="weave-icon"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"></path></svg>';
