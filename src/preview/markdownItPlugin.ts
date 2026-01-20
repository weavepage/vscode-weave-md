/**
 * Main markdown-it plugin hook for Weave preview enhancements.
 * 
 * Constraints (from plan):
 * - All plugins must be pure, synchronous, and side-effect free
 * - Plugins consume host-owned, in-memory caches only (no file I/O)
 * - All transformations must be idempotent (check data-weave="1")
 * - Renderer must not rely on execution order relative to other plugins
 */

import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token';
import type Renderer from 'markdown-it/lib/renderer';
import * as vscode from 'vscode';
import { getIndexStore, Section } from '../validation/indexStore';
import { config } from '../config';
import { renderSectionBody as renderSectionBodyHtml, renderWeaveContent } from './weaveRenderer';
import { DisplayType } from '@weave-md/core';
import { isValidDisplayType } from '../util/displayTypes';

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
 * Parsed node: URL parameters
 */
interface ParsedNodeUrl {
  id: string;
  display?: DisplayType;
  export?: string;
  unknownParams: Record<string, string>;
}

/**
 * Parses a node: URL into its components
 */
function parseNodeUrl(href: string): ParsedNodeUrl | null {
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
        // Use centralized display type validation
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
 * Escapes HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Footnote entry for collection
 */
interface FootnoteEntry {
  id: string;
  num: number;
  title: string;
  content: string;
  refIds: string[];  // IDs of all references to this footnote
}

/**
 * Inline content entry for deferred rendering
 */
interface InlineContentEntry {
  targetId: string;
  content: string;
}

/**
 * Render context for tracking expansion state
 */
interface RenderContext {
  expandedRefs: number;
  expandedIds: Set<string>;
  footnoteCount: number;
  sidenoteCount: number;
  config: PreviewConfig;
  // Footnote tracking: map from section ID to footnote entry
  footnotes: Map<string, FootnoteEntry>;
  footnoteRefCount: number;  // Counter for unique ref IDs
  // Inline content for deferred rendering (to avoid breaking paragraphs)
  inlineContents: InlineContentEntry[];
}

/**
 * Creates a new render context
 */
function createRenderContext(): RenderContext {
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
 * Renders section content for embedding using @weave-md/parse
 * @param stripNodeLinks - If true, nested node links are stripped (for inline display)
 */
function renderSectionBody(section: Section, depth: number, ctx: RenderContext, stripNodeLinks: boolean = false): string {
  // Use fullMarkdown which includes frontmatter - renderer will show error if missing
  const fullDoc = section.fullMarkdown;
  
  // Use the Weave renderer for proper HTML output
  const html = renderSectionBodyHtml(fullDoc, {
    renderMath: true,
    maxChars: ctx.config.maxExpandedCharsPerRef,
    stripNodeLinks
  });
  
  if (fullDoc.length > ctx.config.maxExpandedCharsPerRef) {
    return `${html}<span class="weave-truncated">(Content truncated)</span>`;
  }
  
  return html;
}

/**
 * Renders basic markdown content (simple paragraphs, text formatting)
 * Used for sidenotes and margin notes where full Weave parsing isn't needed
 */
function renderBasicMarkdown(content: string): string {
  // Simple markdown to HTML conversion for basic content
  // Handle paragraphs, bold, italic, code, etc.
  let html = content;
  
  // Convert newlines to paragraphs
  const paragraphs = html.split(/\n\s*\n/).filter(p => p.trim());
  html = paragraphs.map(p => {
    // Basic inline formatting
    p = p.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    p = p.replace(/\*(.*?)\*/g, '<em>$1</em>');
    p = p.replace(/`(.*?)`/g, '<code>$1</code>');
    p = p.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    return `<p>${p.trim()}</p>`;
  }).join('');
  
  // Handle single line content (no paragraphs)
  if (paragraphs.length === 1 && !content.includes('\n\n')) {
    html = html.replace(/^<p>(.*?)<\/p>$/, '$1');
  }
  
  return html;
}

/**
 * Extracts content after YAML frontmatter for sidenote/margin note rendering
 */
function extractContentAfterFrontmatter(fullMarkdown: string): string {
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
    // Return content after frontmatter, trimmed
    return lines.slice(frontmatterEndIndex + 1).join('\n').trim();
  }
  
  // No frontmatter found, return entire document
  return fullMarkdown.trim();
}

/**
 * Renders a node: link with embedded content based on display mode
 */
function renderNodeLink(
  parsed: ParsedNodeUrl,
  linkText: string,
  section: Section | undefined,
  depth: number,
  ctx: RenderContext
): string {
  const display = parsed.display || 'inline';
  const targetId = escapeHtml(parsed.id);
  
  if (!section) {
    return `<span class="weave-link weave-missing" data-weave="1" data-target="${targetId}">
      <a href="#">${escapeHtml(linkText)}</a>
      <span class="weave-badge weave-badge-missing" title="Section not found">?</span>
    </span>`;
  }
  
  const sectionTitle = section.title || section.id;
  // Use # for links since VS Code preview can't navigate to files directly
  // The data-target attribute can be used by scripts for navigation
  const filePath = `#${targetId}`;
  
  if (ctx.expandedIds.has(parsed.id)) {
    return `<span class="weave-link weave-cycle" data-weave="1" data-target="${targetId}">
      <a href="${escapeHtml(filePath)}">${escapeHtml(linkText)}</a>
      <span class="weave-badge weave-badge-cycle" title="Already expanded above">↑</span>
    </span>`;
  }
  
  if (depth > ctx.config.maxPreviewDepth) {
    return `<span class="weave-link weave-depth-limit" data-weave="1" data-target="${targetId}">
      <a href="${escapeHtml(filePath)}">${escapeHtml(linkText)}</a>
      <span class="weave-badge weave-badge-depth" title="Max depth reached">…</span>
    </span>`;
  }
  
  if (ctx.expandedRefs >= ctx.config.maxExpandedRefsPerDoc) {
    return `<span class="weave-link weave-ref-limit" data-weave="1" data-target="${targetId}">
      <a href="${escapeHtml(filePath)}">${escapeHtml(linkText)}</a>
      <span class="weave-badge weave-badge-limit" title="Max refs reached">…</span>
    </span>`;
  }
  
  ctx.expandedRefs++;
  ctx.expandedIds.add(parsed.id);
  
  // Inline nodes strip nested node links; stretch nodes allow nesting
  const stripNodeLinks = display === 'inline';
  const content = renderSectionBody(section, depth + 1, ctx, stripNodeLinks);
  
  ctx.expandedIds.delete(parsed.id);
  
  switch (display) {
    case 'inline':
      return renderInlineExpansion(targetId, linkText, sectionTitle, content, filePath, ctx, depth);
    
    case 'stretch':
      return renderStretchExpansion(targetId, linkText, sectionTitle, content, filePath, ctx, depth);
    
    case 'overlay':
      return renderOverlayExpansion(targetId, linkText, sectionTitle, content, filePath, ctx, depth);
    
    case 'footnote':
      return renderFootnoteRef(targetId, linkText, sectionTitle, content, ctx);
    
    case 'sidenote':
      ctx.sidenoteCount++;
      const sidenoteContent = extractContentAfterFrontmatter(section.fullMarkdown);
      // Use basic markdown rendering for sidenote content to avoid Weave parser requirements
      const sidenoteHtml = renderBasicMarkdown(sidenoteContent);
      return renderSidenote(targetId, linkText, sectionTitle, sidenoteHtml, filePath, ctx.sidenoteCount);
    
    case 'margin':
      const marginContent = extractContentAfterFrontmatter(section.fullMarkdown);
      // Use basic markdown rendering for margin note content to avoid Weave parser requirements
      const marginHtml = renderBasicMarkdown(marginContent);
      return renderMarginNote(targetId, linkText, sectionTitle, marginHtml, filePath);
    
    case 'panel':
      return renderPanelExpansion(targetId, linkText, sectionTitle, content, filePath, ctx, depth);
    
    default:
      return renderInlineExpansion(targetId, linkText, sectionTitle, content, filePath, ctx, depth);
  }
}

// SVG icons for anchor-only references
const ICON_PLUS = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="weave-icon weave-icon-plus"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"></path></svg>';
const ICON_MINUS = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="weave-icon weave-icon-minus"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"></path></svg>';
const ICON_INFO = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="weave-icon"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"></path></svg>';

function isAnchorOnly(linkText: string): boolean {
  return !linkText || !linkText.trim() || linkText.trim() === '';
}

/**
 * Scans content for nested node links and renders templates for their content
 */
function getNestedLinkTemplates(content: string, depth: number, ctx: RenderContext): string {
  // Find all nested node links (have data-nested="1" attribute)
  const regex = /data-target="([^"]+)"\s+data-nested="1"/g;
  const templates: string[] = [];
  const processedIds = new Set<string>();
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    const nestedId = match[1];
    
    // Skip duplicates and cycles
    if (processedIds.has(nestedId) || ctx.expandedIds.has(nestedId)) {
      continue;
    }
    processedIds.add(nestedId);
    
    // Skip if depth exceeded
    if (depth > ctx.config.maxPreviewDepth) {
      continue;
    }
    
    // Get the nested section
    const nestedSection = getIndexStore().getSectionById(nestedId);
    if (!nestedSection) {
      continue;
    }
    
    // Render the nested content
    ctx.expandedIds.add(nestedId);
    const nestedContent = renderSectionBody(nestedSection, depth, ctx);
    ctx.expandedIds.delete(nestedId);
    
    // Add template for this nested link
    templates.push(`<template class="weave-overlay-content-template" data-for="${nestedId}">${nestedContent}</template>`);
  }
  
  return templates.join('');
}

function renderInlineExpansion(targetId: string, linkText: string, title: string, content: string, filePath: string, ctx: RenderContext, depth: number): string {
  // Use template element to hold content without affecting layout
  const contentTemplate = `<template class="weave-inline-content-template" data-for="${targetId}">${content}</template>`;
  
  // Get templates for any nested node links in the content
  const nestedTemplates = getNestedLinkTemplates(content, depth + 1, ctx);
  
  if (isAnchorOnly(linkText)) {
    // Anchor-only: show plus/minus icon
    return `<span class="weave-inline-anchor" data-weave="1" data-target="${targetId}" tabindex="0" role="button" title="Expand ${escapeHtml(title)}">${ICON_PLUS}${ICON_MINUS}</span>${contentTemplate}${nestedTemplates}`;
  }
  // Text link with template content
  return `<span class="weave-inline-trigger" data-weave="1" data-target="${targetId}" tabindex="0" role="button" aria-expanded="false">${escapeHtml(linkText)}</span>${contentTemplate}${nestedTemplates}`;
}

function renderStretchExpansion(targetId: string, linkText: string, title: string, content: string, filePath: string, ctx: RenderContext, depth: number): string {
  // Use template element to hold content without affecting layout
  const contentTemplate = `<template class="weave-stretch-content-template" data-for="${targetId}">${content}</template>`;
  
  // Get templates for any nested node links in the content (stretch allows nesting)
  const nestedTemplates = getNestedLinkTemplates(content, depth + 1, ctx);
  
  if (isAnchorOnly(linkText)) {
    // Anchor-only: show plus/minus icon
    return `<span class="weave-stretch-anchor" data-weave="1" data-target="${targetId}" tabindex="0" role="button" title="Expand ${escapeHtml(title)}">${ICON_PLUS}${ICON_MINUS}</span>${contentTemplate}${nestedTemplates}`;
  }
  // Text link with template content
  return `<span class="weave-stretch-trigger" data-weave="1" data-target="${targetId}" tabindex="0" role="button" aria-expanded="false">${escapeHtml(linkText)}</span>${contentTemplate}${nestedTemplates}`;
}

function renderOverlayExpansion(targetId: string, linkText: string, title: string, content: string, filePath: string, ctx: RenderContext, depth: number): string {
  // Use template element to hold content without affecting layout
  const contentTemplate = `<template class="weave-overlay-content-template" data-for="${targetId}">${content}</template>`;
  
  // Get templates for any nested node links in the content
  const nestedTemplates = getNestedLinkTemplates(content, depth + 1, ctx);
  
  if (isAnchorOnly(linkText)) {
    // Anchor-only: show info icon
    return `<span class="weave-overlay-anchor" data-weave="1" data-target="${targetId}" tabindex="0" role="button" data-display="overlay" title="View ${escapeHtml(title)}">${ICON_INFO}</span>${contentTemplate}${nestedTemplates}`;
  }
  return `<span class="weave-node-link" data-weave="1" data-target="${targetId}" tabindex="0" role="button" data-display="overlay">${escapeHtml(linkText)}</span>${contentTemplate}${nestedTemplates}`;
}

/**
 * Renders a footnote reference (inline superscript) and collects the footnote for later rendering
 */
function renderFootnoteRef(targetId: string, linkText: string, title: string, content: string, ctx: RenderContext): string {
  ctx.footnoteRefCount++;
  const refId = `fnref-${ctx.footnoteRefCount}`;
  
  // Check if this footnote already exists (deduplication)
  let entry = ctx.footnotes.get(targetId);
  if (!entry) {
    // New footnote - assign next number
    ctx.footnoteCount++;
    entry = {
      id: targetId,
      num: ctx.footnoteCount,
      title,
      content,
      refIds: []
    };
    ctx.footnotes.set(targetId, entry);
  }
  
  // Track this reference
  entry.refIds.push(refId);
  
  const fnNum = entry.num;
  
  // Render based on whether there's link text or just anchor
  if (linkText && linkText.trim() && linkText.trim() !== ' ') {
    // Text-linked footnote reference
    return `<a href="#fn-${fnNum}" id="${refId}" class="weave-footnote-link" data-weave="1"><span class="weave-footnote-link-text">${escapeHtml(linkText)}</span><sup>[${fnNum}]</sup></a>`;
  } else {
    // Anchor-only footnote reference
    return `<sup class="weave-footnote-ref" data-weave="1"><a href="#fn-${fnNum}" id="${refId}">[${fnNum}]</a></sup>`;
  }
}

/**
 * Renders all collected footnotes as a section at the bottom
 */
function renderFootnotesSection(ctx: RenderContext): string {
  if (ctx.footnotes.size === 0) {
    return '';
  }
  
  // Collect all nested link templates from footnote content
  let nestedTemplates = '';
  
  const footnotesList = Array.from(ctx.footnotes.values())
    .sort((a, b) => a.num - b.num)
    .map(fn => {
      const backrefId = fn.refIds[0] || '';
      // Scan footnote content for nested links and add their templates
      nestedTemplates += getNestedLinkTemplates(fn.content, 1, ctx);
      return `<li id="fn-${fn.num}" class="weave-footnote"><span class="weave-footnote-marker"><a href="#${backrefId}" class="weave-footnote-backref">[${fn.num}]</a></span><div class="weave-footnote-content">${fn.content}</div></li>`;
    })
    .join('');
  
  return `<hr class="weave-footnotes-separator"><section class="weave-footnotes" data-weave="1"><ol class="weave-footnotes-list">${footnotesList}</ol></section>${nestedTemplates}`;
}

function renderSidenote(targetId: string, linkText: string, title: string, content: string, filePath: string, num: number): string {
  return `<span class="weave-sidenote-container" data-weave="1">
    <span class="weave-sidenote-anchor" data-target="${targetId}" tabindex="0" role="button">
      ${escapeHtml(linkText)}<sup class="weave-sidenote-number">[${num}]</sup>
    </span>
    <span class="weave-sidenote-body" data-target="${targetId}">
      <span class="weave-sidenote-content">
        <span class="weave-header">
          <span class="weave-sidenote-number">${num}.</span>
          <span class="weave-title">${escapeHtml(title)}</span>
          <a class="weave-open-link" href="${escapeHtml(filePath)}" title="Open section">↗</a>
        </span>
        ${content}
      </span>
    </span>
  </span>`;
}

function renderMarginNote(targetId: string, linkText: string, title: string, content: string, filePath: string): string {
  const showAnchor = !isAnchorOnly(linkText);
  return `<span class="weave-margin-note-container" data-weave="1">
    ${showAnchor ? `<span class="weave-margin-note-anchor" data-target="${targetId}" tabindex="0" role="button">${escapeHtml(linkText)}</span>` : ''}
    <span class="weave-margin-note-body" data-target="${targetId}">
      <span class="weave-margin-note-content">
        <span class="weave-header">
          <span class="weave-title">${escapeHtml(title)}</span>
          <a class="weave-open-link" href="${escapeHtml(filePath)}" title="Open section">↗</a>
        </span>
        ${content}
      </span>
    </span>
  </span>`;
}

function renderPanelExpansion(targetId: string, linkText: string, title: string, content: string, filePath: string, ctx: RenderContext, depth: number): string {
  // Use template element to hold content without affecting layout
  const contentTemplate = `<template class="weave-panel-content-template" data-for="${targetId}">${content}</template>`;
  
  // Get templates for any nested node links in the content
  const nestedTemplates = getNestedLinkTemplates(content, depth + 1, ctx);
  
  if (isAnchorOnly(linkText)) {
    // Anchor-only: show panel icon
    return `<span class="weave-panel-anchor" data-weave="1" data-target="${targetId}" tabindex="0" role="button" title="Open panel: ${escapeHtml(title)}">${ICON_INFO}</span>${contentTemplate}${nestedTemplates}`;
  }
  
  // Text link with template content
  return `<span class="weave-panel-trigger" data-weave="1" data-target="${targetId}" tabindex="0" role="button" aria-expanded="false">${escapeHtml(linkText)}</span>${contentTemplate}${nestedTemplates}`;
}

/**
 * Creates the main Weave markdown-it plugin.
 * Transforms node: links into interactive Weave elements with pre-embedded content.
 */
export function createWeavePlugin(md: MarkdownIt, _outputChannel?: vscode.OutputChannel): void {
  const defaultLinkOpen = md.renderer.rules.link_open || 
    function(tokens: Token[], idx: number, options: MarkdownIt.Options, _env: unknown, self: Renderer) {
      return self.renderToken(tokens, idx, options);
    };
  
  const defaultLinkClose = md.renderer.rules.link_close ||
    function(tokens: Token[], idx: number, options: MarkdownIt.Options, _env: unknown, self: Renderer) {
      return self.renderToken(tokens, idx, options);
    };
  
  // Add a core rule to initialize weaveContext early
  md.core.ruler.push('weave_init', function(state) {
    const env = state.env as WeaveEnv;
    if (!env.weaveContext) {
      env.weaveContext = createRenderContext();
    }
  });

  // Add a core rule to inject configuration for client-side use
  md.core.ruler.push('weave_config_inject', function(state) {
    // Only inject config once at the beginning of the document
    if (state.tokens.length > 0 && state.tokens[0].type === 'html_inline') {
      const config = getPreviewConfig();
      const configScript = `<script>window.__weaveConfig = ${JSON.stringify(config)};</script>`;
      state.tokens.unshift({
        type: 'html_inline',
        content: configScript,
        level: 0,
        children: undefined,
        markup: '',
        map: undefined,
        meta: undefined,
        nesting: 0,
        tag: '',
        attrIndex: -1,
        attrs: undefined,
        block: false,
        hidden: false,
        info: '',
        contentLoc: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
      } as any);
    }
  });
  
  const defaultText = md.renderer.rules.text ||
    function(tokens: Token[], idx: number) {
      return escapeHtml(tokens[idx].content);
    };

  interface WeaveEnv {
    weaveContext?: RenderContext;
    weavePendingLink?: {
      parsed: ParsedNodeUrl;
      startIdx: number;
    };
    weaveSkipUntil?: number;
  }

  md.renderer.rules.link_open = function(tokens: Token[], idx: number, options: MarkdownIt.Options, env: WeaveEnv, self: Renderer): string {
    const token = tokens[idx];
    const href = token.attrGet('href');
    
    if (href && href.startsWith('node:')) {
      if (token.attrGet('data-weave') === '1') {
        return defaultLinkOpen(tokens, idx, options, env, self);
      }
      
      const parsed = parseNodeUrl(href);
      if (parsed) {
        if (!env.weaveContext) {
          env.weaveContext = createRenderContext();
        }
        env.weavePendingLink = { parsed, startIdx: idx };
        return '';
      }
    }
    
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  md.renderer.rules.text = function(tokens: Token[], idx: number, options: MarkdownIt.Options, env: WeaveEnv, self: Renderer): string {
    if (env.weavePendingLink && env.weaveSkipUntil === undefined) {
      return '';
    }
    return defaultText(tokens, idx, options, env, self);
  };

  md.renderer.rules.link_close = function(tokens: Token[], idx: number, options: MarkdownIt.Options, env: WeaveEnv, self: Renderer): string {
    if (env.weavePendingLink) {
      const { parsed, startIdx } = env.weavePendingLink;
      env.weavePendingLink = undefined;
      
      let linkText = '';
      for (let i = startIdx + 1; i < idx; i++) {
        if (tokens[i].type === 'text') {
          linkText += tokens[i].content;
        } else if (tokens[i].type === 'code_inline') {
          linkText += tokens[i].content;
        }
      }
      
      const section = getIndexStore().getSectionById(parsed.id);
      const ctx = env.weaveContext || createRenderContext();
      
      return renderNodeLink(parsed, linkText || parsed.id, section, 0, ctx);
    }
    
    return defaultLinkClose(tokens, idx, options, env, self);
  };

  // Wrap the render function to append footnotes and deferred content at the end
  const originalRender = md.render.bind(md);
  md.render = function(src: string, env?: WeaveEnv): string {
    // Create a fresh context for each render
    const renderEnv: WeaveEnv = env || {};
    renderEnv.weaveContext = createRenderContext();
    
    // Render the main content
    let html = originalRender(src, renderEnv);
    
    // Append deferred inline/overlay content (rendered outside paragraphs to avoid breaking them)
    if (renderEnv.weaveContext && renderEnv.weaveContext.inlineContents.length > 0) {
      const deferredHtml = renderDeferredContent(renderEnv.weaveContext);
      html += deferredHtml;
    }
    
    // Append footnotes section if any were collected
    if (renderEnv.weaveContext && renderEnv.weaveContext.footnotes.size > 0) {
      html += renderFootnotesSection(renderEnv.weaveContext);
    }
    
    return html;
  };
  
  // Also wrap renderer.render to catch VS Code's preview which may call it directly
  const originalRendererRender = md.renderer.render.bind(md.renderer);
  md.renderer.render = function(tokens: Token[], options: MarkdownIt.Options, env: WeaveEnv): string {
    // Ensure context exists
    if (!env.weaveContext) {
      env.weaveContext = createRenderContext();
    }
    
    // Render all tokens
    let html = originalRendererRender(tokens, options, env);
    
    // Append footnotes section if any were collected
    if (env.weaveContext && env.weaveContext.footnotes.size > 0) {
      html += renderFootnotesSection(env.weaveContext);
    }
    
    return html;
  };
}

/**
 * Renders deferred inline/overlay content at end of document
 * This avoids breaking paragraph structure with block elements
 */
function renderDeferredContent(ctx: RenderContext): string {
  if (ctx.inlineContents.length === 0) return '';
  
  let html = '<div class="weave-deferred-content" style="display:none;">';
  for (const entry of ctx.inlineContents) {
    // Inline content
    html += `<div class="weave-inline-content" data-for="${entry.targetId}">${entry.content}</div>`;
    // Overlay content (same content, different container)
    html += `<div class="weave-overlay-content" data-for="${entry.targetId}"><div class="weave-overlay-body">${entry.content}</div></div>`;
  }
  html += '</div>';
  return html;
}

/**
 * Processes inline math syntax :math[...] in text content
 */
function processInlineMath(text: string): string {
  // Replace :math[content] with rendered math
  return text.replace(/:math\[([^\]]+)\]/g, (match, mathContent) => {
    try {
      const katex = require('katex');
      const html = katex.renderToString(mathContent.trim(), {
        displayMode: false,
        throwOnError: false,
        output: 'html'
      });
      return `<span class="weave-math weave-math-inline" data-weave="1">${html}</span>`;
    } catch {
      return `<span class="weave-math weave-math-inline weave-math-error" data-weave="1">
        <code>${escapeHtml(mathContent)}</code>
        <span class="weave-error">Math error</span>
      </span>`;
    }
  });
}

/**
 * Processes inline substitution syntax :sub[INITIAL]{REPLACEMENT} in text content
 * Handles nested sub syntax in replacement content
 */
function processInlineSub(text: string): string {
  let subIndex = 0;
  
  function parseSubAtPosition(startIndex: number): { match: string; initial: string; replacement: string; endIndex: number } | null {
    // Check if we have :sub[ at this position
    if (!text.startsWith(':sub[', startIndex)) {
      return null;
    }
    
    let pos = startIndex + 5; // Skip ':sub['
    
    // Parse initial content until ]
    let initial = '';
    let braceCount = 0;
    while (pos < text.length) {
      if (text[pos] === ']' && braceCount === 0) {
        break;
      } else if (text[pos] === '{') {
        braceCount++;
      } else if (text[pos] === '}') {
        if (braceCount > 0) braceCount--;
      }
      initial += text[pos];
      pos++;
    }
    
    if (pos >= text.length || text[pos] !== ']') {
      return null; // Malformed - no closing ]
    }
    
    pos++; // Skip ]
    
    // Expect {
    if (pos >= text.length || text[pos] !== '{') {
      return null; // Malformed - no opening {
    }
    
    pos++; // Skip {
    
    // Parse replacement content with nested sub support
    let replacement = '';
    braceCount = 1; // Start with 1 for the opening {
    
    while (pos < text.length && braceCount > 0) {
      if (text[pos] === '{') {
        braceCount++;
      } else if (text[pos] === '}') {
        braceCount--;
      }
      
      if (braceCount > 0) {
        replacement += text[pos];
      }
      pos++;
    }
    
    if (braceCount !== 0) {
      return null; // Malformed - unclosed braces
    }
    
    const match = text.substring(startIndex, pos);
    return { match, initial, replacement, endIndex: pos };
  }
  
  // Process all sub instances from left to right
  let result = '';
  let pos = 0;
  
  while (pos < text.length) {
    const parsed = parseSubAtPosition(pos);
    
    if (parsed) {
      // Process the sub
      const id = `weave-sub-${subIndex++}`;
      
      // Recursively process nested subs in replacement - use early filter
      let processedReplacement = parsed.replacement;
      if (/:sub\[/.test(parsed.replacement)) {
        processedReplacement = processInlineSub(parsed.replacement);
      }
      
      const escapedInitial = escapeHtml(parsed.initial);
      // Don't escape processedReplacement as it already contains HTML from nested subs
      const replacementContent = processedReplacement.includes('<span class="weave-sub') 
        ? processedReplacement 
        : escapeHtml(processedReplacement);
      
      result += `<span class="weave-sub weave-sub-inline" data-weave="1" data-sub-id="${id}" data-initial="${escapedInitial}" data-replacement="${escapeHtml(parsed.replacement)}">
        <span class="weave-sub-content weave-sub-initial">${escapedInitial}</span>
        <span class="weave-sub-content weave-sub-replacement" style="display: none;">${replacementContent}</span>
      </span>`;
      
      pos = parsed.endIndex;
    } else {
      result += text[pos];
      pos++;
    }
  }
  
  return result;
}

/**
 * Creates the Weave format block plugin for math/media/etc.
 * Handles fenced code blocks with special info strings and inline math.
 */
export function createWeaveFormatPlugin(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence || 
    function(tokens: Token[], idx: number, options: MarkdownIt.Options, _env: unknown, self: Renderer) {
      return self.renderToken(tokens, idx, options);
    };

  const defaultText = md.renderer.rules.text ||
    function(tokens: Token[], idx: number) {
      return escapeHtml(tokens[idx].content);
    };

  // Handle fenced code blocks
  md.renderer.rules.fence = function(tokens: Token[], idx: number, options: MarkdownIt.Options, env: unknown, self: Renderer): string {
    const token = tokens[idx];
    const info = token.info.trim().toLowerCase();
    const content = token.content;
    
    if (token.attrGet('data-weave') === '1') {
      return defaultFence(tokens, idx, options, env, self);
    }
    
    switch (info) {
      case 'math':
        return renderMathBlock(content);
      
      case 'image':
        return renderImageBlock(content);
      
      case 'gallery':
        return renderGalleryBlock(content);
      
      case 'audio':
        return renderAudioBlock(content);
      
      case 'video':
        return renderVideoBlock(content);
      
      case 'embed':
        return renderEmbedBlock(content);
      
      case 'pre':
        return renderPreBlock(content);
      
      default:
        return defaultFence(tokens, idx, options, env, self);
    }
  };

  // Handle inline math in text content
  md.renderer.rules.text = function(tokens: Token[], idx: number, options: MarkdownIt.Options, env: unknown, self: Renderer): string {
    const token = tokens[idx];
    let content = token.content;
    
    if (token.attrGet('data-weave') === '1') {
      return defaultText(tokens, idx, options, env, self);
    }
    
    // Process inline math syntax
    if (content.includes(':math[')) {
      content = processInlineMath(content);
    }
    
    // Process inline substitution syntax - use quick regex check before expensive parsing
    if (/:sub\[/.test(content)) {
      content = processInlineSub(content);
    }
    
    return content;
  };
}

function renderMathBlock(content: string): string {
  try {
    const katex = require('katex');
    const html = katex.renderToString(content.trim(), {
      displayMode: true,
      throwOnError: false,
      output: 'html'
    });
    return `<div class="weave-math weave-math-block" data-weave="1">${html}</div>`;
  } catch {
    return `<div class="weave-math weave-math-block weave-math-error" data-weave="1">
      <pre>${escapeHtml(content)}</pre>
      <span class="weave-error">Math rendering error</span>
    </div>`;
  }
}

function parseYamlBlock(content: string): Record<string, unknown> {
  try {
    const yaml = require('yaml');
    return yaml.parse(content) || {};
  } catch {
    return {};
  }
}

function renderImageBlock(content: string): string {
  const data = parseYamlBlock(content);
  const file = String(data.file || '');
  const alt = String(data.alt || '');
  const caption = String(data.caption || '');
  const width = data.width ? `width="${escapeHtml(String(data.width))}"` : '';
  
  if (!file) {
    return `<div class="weave-media weave-image weave-error" data-weave="1">
      <span class="weave-error">Missing file in image block</span>
    </div>`;
  }
  
  return `<figure class="weave-media weave-image" data-weave="1">
    <img src="${escapeHtml(file)}" alt="${escapeHtml(alt)}" ${width} />
    ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
  </figure>`;
}

function renderGalleryBlock(content: string): string {
  const data = parseYamlBlock(content);
  const files = Array.isArray(data.files) ? data.files : [];
  const caption = String(data.caption || '');
  
  if (files.length === 0) {
    return `<div class="weave-media weave-gallery weave-error" data-weave="1">
      <span class="weave-error">No files in gallery block</span>
    </div>`;
  }
  
  const images = files.map((f: unknown) => {
    const file = typeof f === 'string' ? f : String((f as Record<string, unknown>)?.file || '');
    const alt = typeof f === 'object' ? String((f as Record<string, unknown>)?.alt || '') : '';
    return `<img src="${escapeHtml(file)}" alt="${escapeHtml(alt)}" />`;
  }).join('');
  
  return `<figure class="weave-media weave-gallery" data-weave="1">
    <div class="weave-gallery-grid">${images}</div>
    ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
  </figure>`;
}

function renderAudioBlock(content: string): string {
  const data = parseYamlBlock(content);
  const file = String(data.file || '');
  const caption = String(data.caption || '');
  
  if (!file) {
    return `<div class="weave-media weave-audio weave-error" data-weave="1">
      <span class="weave-error">Missing file in audio block</span>
    </div>`;
  }
  
  return `<figure class="weave-media weave-audio" data-weave="1">
    <audio controls src="${escapeHtml(file)}"></audio>
    ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
  </figure>`;
}

function renderVideoBlock(content: string): string {
  const data = parseYamlBlock(content);
  const file = String(data.file || '');
  const caption = String(data.caption || '');
  const width = data.width ? `width="${escapeHtml(String(data.width))}"` : '';
  
  if (!file) {
    return `<div class="weave-media weave-video weave-error" data-weave="1">
      <span class="weave-error">Missing file in video block</span>
    </div>`;
  }
  
  return `<figure class="weave-media weave-video" data-weave="1">
    <video controls ${width} src="${escapeHtml(file)}"></video>
    ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
  </figure>`;
}

function renderEmbedBlock(content: string): string {
  const data = parseYamlBlock(content);
  const url = String(data.url || '');
  const caption = String(data.caption || '');
  
  if (!url) {
    return `<div class="weave-media weave-embed weave-error" data-weave="1">
      <span class="weave-error">Missing url in embed block</span>
    </div>`;
  }
  
  // Extract YouTube video ID for thumbnail display
  // Show thumbnail first, then replace with iframe on click (lazy load pattern)
  const youtubeMatch = url.match(/(?:youtube\.com\/embed\/|youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (youtubeMatch) {
    const videoId = youtubeMatch[1];
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    
    return `<figure class="weave-media weave-embed weave-embed-youtube" data-weave="1" data-video-id="${escapeHtml(videoId)}">
      <div class="weave-embed-container" data-embed-url="${escapeHtml(embedUrl)}">
        <img src="${escapeHtml(thumbnailUrl)}" alt="YouTube video thumbnail" class="weave-embed-thumbnail" />
        <button class="weave-embed-play-button" type="button" aria-label="Play video">▶</button>
      </div>
      ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
    </figure>`;
  }
  
  // For non-YouTube embeds, show a link (iframes are blocked by VS Code CSP)
  return `<figure class="weave-media weave-embed" data-weave="1">
    <a href="${escapeHtml(url)}" class="weave-embed-link weave-embed-external" title="Open in browser">
      <span class="weave-embed-icon">🔗</span>
      <span class="weave-embed-url">${escapeHtml(url)}</span>
    </a>
    ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
  </figure>`;
}

function renderPreBlock(content: string): string {
  return `<pre class="weave-pre" data-weave="1">${escapeHtml(content)}</pre>`;
}
