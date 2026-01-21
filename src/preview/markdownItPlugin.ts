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
import { renderSectionBody as renderSectionBodyHtml } from './weaveRenderer';

// Import types
import type { ParsedNodeUrl, RenderContext, PreviewConfig } from './types';

// Import utilities
import {
  escapeHtml,
  parseNodeUrl,
  getPreviewConfig,
  createRenderContext,
  renderBasicMarkdown,
  extractContentAfterFrontmatter
} from './utils';

// Import renderers
import {
  renderInlineExpansion,
  renderStretchExpansion,
  renderOverlayExpansion,
  renderFootnoteRef,
  renderFootnotesSection,
  renderSidenote,
  renderMarginNote,
  renderPanelExpansion,
  renderMathBlock,
  renderImageBlock,
  renderGalleryBlock,
  renderAudioBlock,
  renderVideoBlock,
  renderEmbedBlock,
  renderPreBlock,
  processInlineMath,
  processInlineSub
} from './renderers';

// Re-export types and utilities for external consumers
export type { PreviewConfig } from './types';
export { getPreviewConfig } from './utils';

/**
 * Renders section content for embedding
 */
function renderSectionBody(section: Section, depth: number, ctx: RenderContext, stripNodeLinks: boolean = false): string {
  const fullDoc = section.fullMarkdown;
  
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
      const sidenoteHtml = renderBasicMarkdown(sidenoteContent);
      return renderSidenote(targetId, linkText, sectionTitle, sidenoteHtml, filePath, ctx.sidenoteCount);
    
    case 'margin':
      const marginContent = extractContentAfterFrontmatter(section.fullMarkdown);
      const marginHtml = renderBasicMarkdown(marginContent);
      return renderMarginNote(targetId, linkText, sectionTitle, marginHtml, filePath);
    
    case 'panel':
      return renderPanelExpansion(targetId, linkText, sectionTitle, content, filePath, ctx, depth);
    
    default:
      return renderInlineExpansion(targetId, linkText, sectionTitle, content, filePath, ctx, depth);
  }
}

/**
 * Renders deferred inline/overlay content at end of document
 */
function renderDeferredContent(ctx: RenderContext): string {
  if (ctx.inlineContents.length === 0) return '';
  
  let html = '<div class="weave-deferred-content" style="display:none;">';
  for (const entry of ctx.inlineContents) {
    html += `<div class="weave-inline-content" data-for="${entry.targetId}">${entry.content}</div>`;
    html += `<div class="weave-overlay-content" data-for="${entry.targetId}"><div class="weave-overlay-body">${entry.content}</div></div>`;
  }
  html += '</div>';
  return html;
}

interface WeaveEnv {
  weaveContext?: RenderContext;
  weavePendingLink?: {
    parsed: ParsedNodeUrl;
    startIdx: number;
    tokens: Token[];
  };
  weaveSkipUntil?: number;
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
  
  // Initialize weaveContext early
  md.core.ruler.push('weave_init', function(state) {
    const env = state.env as WeaveEnv;
    if (!env.weaveContext) {
      env.weaveContext = createRenderContext();
    }
  });

  // Inject configuration for client-side use
  md.core.ruler.push('weave_config_inject', function(state) {
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
        env.weavePendingLink = { parsed, startIdx: idx, tokens };
        return '';
      }
    }
    
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  md.renderer.rules.text = function(tokens: Token[], idx: number, options: MarkdownIt.Options, env: WeaveEnv, self: Renderer): string {
    if (env.weavePendingLink && 
        env.weavePendingLink.tokens === tokens &&
        env.weaveSkipUntil === undefined && 
        idx > env.weavePendingLink.startIdx) {
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

  // Wrap render to append footnotes and deferred content
  const originalRender = md.render.bind(md);
  md.render = function(src: string, env?: WeaveEnv): string {
    const renderEnv: WeaveEnv = env || {};
    renderEnv.weaveContext = createRenderContext();
    
    let html = originalRender(src, renderEnv);
    
    if (renderEnv.weaveContext && renderEnv.weaveContext.inlineContents.length > 0) {
      html += renderDeferredContent(renderEnv.weaveContext);
    }
    
    if (renderEnv.weaveContext && renderEnv.weaveContext.footnotes.size > 0) {
      html += renderFootnotesSection(renderEnv.weaveContext);
    }
    
    return html;
  };
  
  // Wrap renderer.render for VS Code's preview
  const originalRendererRender = md.renderer.render.bind(md.renderer);
  md.renderer.render = function(tokens: Token[], options: MarkdownIt.Options, env: WeaveEnv): string {
    if (!env.weaveContext) {
      env.weaveContext = createRenderContext();
    }
    
    let html = originalRendererRender(tokens, options, env);
    
    if (env.weaveContext && env.weaveContext.footnotes.size > 0) {
      html += renderFootnotesSection(env.weaveContext);
    }
    
    return html;
  };
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

  const previousTextRule = md.renderer.rules.text ||
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

  // Handle inline math and :sub in text content
  md.renderer.rules.text = function(tokens: Token[], idx: number, options: MarkdownIt.Options, env: unknown, self: Renderer): string {
    let content = previousTextRule(tokens, idx, options, env, self);
    
    if (content === '') {
      return '';
    }
    
    const token = tokens[idx];
    if (token.attrGet('data-weave') === '1') {
      return content;
    }
    
    if (content.includes(':math[')) {
      content = processInlineMath(content);
    }
    
    if (/:sub\[/.test(content)) {
      content = processInlineSub(content);
    }
    
    return content;
  };
}
