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

/**
 * Preview configuration from VS Code settings
 */
export interface PreviewConfig {
  enablePreviewEnhancements: boolean;
  maxPreviewDepth: number;
  maxExpandedCharsPerRef: number;
  maxExpandedRefsPerDoc: number;
  showPreviewLabels: boolean;
}

/**
 * Gets preview configuration from VS Code settings
 */
export function getPreviewConfig(): PreviewConfig {
  const config = vscode.workspace.getConfiguration('weave');
  return {
    enablePreviewEnhancements: config.get('enablePreviewEnhancements', true),
    maxPreviewDepth: config.get('maxPreviewDepth', 3),
    maxExpandedCharsPerRef: config.get('maxExpandedCharsPerRef', 12000),
    maxExpandedRefsPerDoc: config.get('maxExpandedRefsPerDoc', 50),
    showPreviewLabels: config.get('showPreviewLabels', true)
  };
}

/**
 * Parsed node: URL parameters
 */
interface ParsedNodeUrl {
  id: string;
  display?: 'inline' | 'stretch' | 'overlay' | 'footnote' | 'sidenote' | 'margin';
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
        const validDisplays = ['inline', 'stretch', 'overlay', 'footnote', 'sidenote', 'margin'];
        if (validDisplays.includes(value)) {
          result.display = value as ParsedNodeUrl['display'];
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
 * Render context for tracking expansion state
 */
interface RenderContext {
  expandedRefs: number;
  expandedIds: Set<string>;
  footnoteCount: number;
  sidenoteCount: number;
  config: PreviewConfig;
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
    config: getPreviewConfig()
  };
}

/**
 * Renders section content for embedding (simplified markdown rendering)
 */
function renderSectionBody(section: Section, depth: number, ctx: RenderContext): string {
  const body = section.bodyMarkdown;
  
  if (body.length > ctx.config.maxExpandedCharsPerRef) {
    const truncated = body.slice(0, ctx.config.maxExpandedCharsPerRef);
    return `<div class="weave-content">${escapeHtml(truncated)}</div>
      <div class="weave-truncated">(Content truncated - ${body.length} chars total)</div>`;
  }
  
  return `<div class="weave-content">${escapeHtml(body)}</div>`;
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
  const filePath = section.uri.fsPath;
  
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
  
  const content = renderSectionBody(section, depth + 1, ctx);
  
  ctx.expandedIds.delete(parsed.id);
  
  switch (display) {
    case 'inline':
      return renderInlineExpansion(targetId, linkText, sectionTitle, content, filePath);
    
    case 'stretch':
      return renderStretchExpansion(targetId, linkText, sectionTitle, content, filePath);
    
    case 'overlay':
      return renderOverlayExpansion(targetId, linkText, sectionTitle, content, filePath);
    
    case 'footnote':
      ctx.footnoteCount++;
      return renderFootnote(targetId, linkText, sectionTitle, content, filePath, ctx.footnoteCount);
    
    case 'sidenote':
      ctx.sidenoteCount++;
      return renderSidenote(targetId, linkText, sectionTitle, content, filePath, ctx.sidenoteCount);
    
    case 'margin':
      return renderMarginNote(targetId, linkText, sectionTitle, content, filePath);
    
    default:
      return renderInlineExpansion(targetId, linkText, sectionTitle, content, filePath);
  }
}

function renderInlineExpansion(targetId: string, linkText: string, title: string, content: string, filePath: string): string {
  return `<span class="weave-expansion weave-inline" data-weave="1" data-target="${targetId}">
    <span class="weave-toggle" tabindex="0" role="button" aria-expanded="false">
      <span class="weave-toggle-icon">▶</span>
      <span class="weave-link-text">${escapeHtml(linkText)}</span>
    </span>
    <span class="weave-body" hidden>
      <span class="weave-header">
        <span class="weave-title">${escapeHtml(title)}</span>
        <a class="weave-open-link" href="${escapeHtml(filePath)}" title="Open section">↗</a>
      </span>
      ${content}
    </span>
  </span>`;
}

function renderStretchExpansion(targetId: string, linkText: string, title: string, content: string, filePath: string): string {
  return `<div class="weave-expansion weave-stretch" data-weave="1" data-target="${targetId}">
    <div class="weave-toggle" tabindex="0" role="button" aria-expanded="false">
      <span class="weave-toggle-icon">▶</span>
      <span class="weave-link-text">${escapeHtml(linkText)}</span>
    </div>
    <div class="weave-body" hidden>
      <div class="weave-header">
        <span class="weave-title">${escapeHtml(title)}</span>
        <a class="weave-open-link" href="${escapeHtml(filePath)}" title="Open section">↗</a>
      </div>
      ${content}
    </div>
  </div>`;
}

function renderOverlayExpansion(targetId: string, linkText: string, title: string, content: string, filePath: string): string {
  return `<span class="weave-expansion weave-overlay" data-weave="1" data-target="${targetId}">
    <span class="weave-trigger" tabindex="0" role="button" aria-haspopup="true">
      ${escapeHtml(linkText)}
    </span>
    <span class="weave-popover" role="tooltip" hidden>
      <span class="weave-header">
        <span class="weave-title">${escapeHtml(title)}</span>
        <a class="weave-open-link" href="${escapeHtml(filePath)}" title="Open section">↗</a>
      </span>
      ${content}
    </span>
  </span>`;
}

function renderFootnote(targetId: string, linkText: string, title: string, content: string, filePath: string, num: number): string {
  const noteId = `weave-fn-${targetId}-${num}`;
  return `<span class="weave-expansion weave-footnote" data-weave="1" data-target="${targetId}">
    <span class="weave-fn-text">${escapeHtml(linkText)}</span>
    <sup class="weave-fn-ref">
      <a href="#${noteId}" id="${noteId}-ref" class="weave-fn-link">${num}</a>
    </sup>
    <span class="weave-fn-body" id="${noteId}" hidden>
      <span class="weave-header">
        <a href="#${noteId}-ref" class="weave-fn-back">↩</a>
        <span class="weave-title">${escapeHtml(title)}</span>
        <a class="weave-open-link" href="${escapeHtml(filePath)}" title="Open section">↗</a>
      </span>
      ${content}
    </span>
  </span>`;
}

function renderSidenote(targetId: string, linkText: string, title: string, content: string, filePath: string, num: number): string {
  return `<span class="weave-expansion weave-sidenote" data-weave="1" data-target="${targetId}">
    <span class="weave-sn-text">${escapeHtml(linkText)}</span>
    <sup class="weave-sn-ref">${num}</sup>
    <span class="weave-sn-body">
      <span class="weave-sn-num">${num}.</span>
      <span class="weave-header">
        <span class="weave-title">${escapeHtml(title)}</span>
        <a class="weave-open-link" href="${escapeHtml(filePath)}" title="Open section">↗</a>
      </span>
      ${content}
    </span>
  </span>`;
}

function renderMarginNote(targetId: string, linkText: string, title: string, content: string, filePath: string): string {
  return `<span class="weave-expansion weave-margin" data-weave="1" data-target="${targetId}">
    <span class="weave-margin-text">${escapeHtml(linkText)}</span>
    <span class="weave-margin-body">
      <span class="weave-header">
        <span class="weave-title">${escapeHtml(title)}</span>
        <a class="weave-open-link" href="${escapeHtml(filePath)}" title="Open section">↗</a>
      </span>
      ${content}
    </span>
  </span>`;
}

/**
 * Creates the main Weave markdown-it plugin.
 * Transforms node: links into interactive Weave elements with pre-embedded content.
 */
export function createWeavePlugin(md: MarkdownIt, _outputChannel?: vscode.OutputChannel): void {
  const indexStore = getIndexStore();
  
  const defaultLinkOpen = md.renderer.rules.link_open || 
    function(tokens: Token[], idx: number, options: MarkdownIt.Options, _env: unknown, self: Renderer) {
      return self.renderToken(tokens, idx, options);
    };
  
  const defaultLinkClose = md.renderer.rules.link_close ||
    function(tokens: Token[], idx: number, options: MarkdownIt.Options, _env: unknown, self: Renderer) {
      return self.renderToken(tokens, idx, options);
    };
  
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
      
      const section = indexStore.getSectionById(parsed.id);
      const ctx = env.weaveContext || createRenderContext();
      
      return renderNodeLink(parsed, linkText || parsed.id, section, 0, ctx);
    }
    
    return defaultLinkClose(tokens, idx, options, env, self);
  };
}

/**
 * Renders inline math with :math[...] syntax
 */
function renderInlineMath(content: string): string {
  try {
    const katex = require('katex');
    const html = katex.renderToString(content.trim(), {
      displayMode: false,
      throwOnError: false,
      output: 'html'
    });
    return `<span class="weave-math weave-math-inline" data-weave="1">${html}</span>`;
  } catch {
    return `<span class="weave-math weave-math-inline weave-math-error" data-weave="1">
      <code>${escapeHtml(content)}</code>
      <span class="weave-error">Math error</span>
    </span>`;
  }
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
      
      case 'pre':
        return renderPreBlock(content);
      
      default:
        return defaultFence(tokens, idx, options, env, self);
    }
  };

  // Handle inline math in text content
  md.renderer.rules.text = function(tokens: Token[], idx: number, options: MarkdownIt.Options, env: unknown, self: Renderer): string {
    const token = tokens[idx];
    const content = token.content;
    
    if (token.attrGet('data-weave') === '1') {
      return defaultText(tokens, idx, options, env, self);
    }
    
    // Process inline math syntax
    if (content.includes(':math[')) {
      return processInlineMath(content);
    }
    
    return defaultText(tokens, idx, options, env, self);
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

function renderPreBlock(content: string): string {
  return `<pre class="weave-pre" data-weave="1">${escapeHtml(content)}</pre>`;
}
