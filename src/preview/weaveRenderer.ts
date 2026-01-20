/**
 * Weave content renderer using @weave-md/parse
 * 
 * Converts Weave markdown to HTML using the official parser's AST,
 * ensuring consistent rendering with the spec.
 */

import { parseToMdast } from '@weave-md/parse';
import { toHast } from 'mdast-util-to-hast';
import { toHtml } from 'hast-util-to-html';
import type { Root as MdastRoot } from 'mdast';
import type { Root as HastRoot, Element, Text } from 'hast';

/**
 * Render options for Weave content
 */
export interface RenderOptions {
  renderMath?: boolean;
  maxChars?: number;
  stripNodeLinks?: boolean;
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
 * Renders a math block using KaTeX
 */
function renderMathBlock(content: string, displayMode: boolean): string {
  try {
    const katex = require('katex');
    const html = katex.renderToString(content.trim(), {
      displayMode,
      throwOnError: false,
      output: 'html'
    });
    const className = displayMode ? 'weave-math-block' : 'weave-math-inline';
    const tag = displayMode ? 'div' : 'span';
    return `<${tag} class="${className}">${html}</${tag}>`;
  } catch {
    const className = displayMode ? 'weave-math-block weave-math-error' : 'weave-math-inline weave-math-error';
    const tag = displayMode ? 'div' : 'span';
    return `<${tag} class="${className}"><code>${escapeHtml(content)}</code></${tag}>`;
  }
}

/**
 * Renders an image block from YAML content
 */
function renderImageBlock(content: string): string {
  try {
    const yaml = require('yaml');
    const data = yaml.parse(content) || {};
    const src = data.file || data.src || '';
    const alt = data.alt || '';
    const caption = data.caption || '';
    const width = data.width ? `width="${escapeHtml(String(data.width))}"` : '';
    
    if (!src) {
      return '<div class="weave-media weave-image weave-error">Missing file in image block</div>';
    }
    
    return `<figure class="weave-media weave-image">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" ${width} />
      ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
    </figure>`;
  } catch {
    return '<div class="weave-media weave-image weave-error">Invalid image block</div>';
  }
}

/**
 * Renders a gallery block from YAML content
 */
function renderGalleryBlock(content: string): string {
  try {
    const yaml = require('yaml');
    const data = yaml.parse(content) || {};
    const files = Array.isArray(data.files) ? data.files : [];
    const caption = data.caption || '';
    
    if (files.length === 0) {
      return '<div class="weave-media weave-gallery weave-error">No files in gallery block</div>';
    }
    
    const images = files.map((f: unknown) => {
      const src = typeof f === 'string' ? f : String((f as Record<string, unknown>)?.file || (f as Record<string, unknown>)?.src || '');
      const alt = typeof f === 'object' ? String((f as Record<string, unknown>)?.alt || '') : '';
      return `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" /></figure>`;
    }).join('');
    
    return `<div class="weave-media weave-gallery">
      ${images}
      ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
    </div>`;
  } catch {
    return '<div class="weave-media weave-gallery weave-error">Invalid gallery block</div>';
  }
}

/**
 * Renders an audio block from YAML content
 */
function renderAudioBlock(content: string): string {
  try {
    const yaml = require('yaml');
    const data = yaml.parse(content) || {};
    const src = data.file || data.src || '';
    const caption = data.caption || '';
    
    if (!src) {
      return '<div class="weave-media weave-audio weave-error">Missing file in audio block</div>';
    }
    
    return `<figure class="weave-media weave-audio">
      <audio controls src="${escapeHtml(src)}"></audio>
      ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
    </figure>`;
  } catch {
    return '<div class="weave-media weave-audio weave-error">Invalid audio block</div>';
  }
}

/**
 * Renders a video block from YAML content
 */
function renderVideoBlock(content: string): string {
  try {
    const yaml = require('yaml');
    const data = yaml.parse(content) || {};
    const src = data.file || data.src || '';
    const caption = data.caption || '';
    const poster = data.poster || '';
    const width = data.width ? `width="${escapeHtml(String(data.width))}"` : '';
    
    if (!src) {
      return '<div class="weave-media weave-video weave-error">Missing file in video block</div>';
    }
    
    const posterAttr = poster ? `poster="${escapeHtml(poster)}"` : '';
    
    return `<figure class="weave-media weave-video">
      <video controls ${width} ${posterAttr} src="${escapeHtml(src)}"></video>
      ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
    </figure>`;
  } catch {
    return '<div class="weave-media weave-video weave-error">Invalid video block</div>';
  }
}

/**
 * Renders an embed block from YAML content
 */
function renderEmbedBlock(content: string): string {
  try {
    const yaml = require('yaml');
    const data = yaml.parse(content) || {};
    const url = data.url || '';
    const caption = data.caption || '';
    const width = data.width || '100%';
    const height = data.height || '';
    
    if (!url) {
      return '<div class="weave-media weave-embed weave-error">Missing url in embed block</div>';
    }
    
    const widthAttr = `width="${escapeHtml(String(width))}"`;
    const heightAttr = height ? `height="${escapeHtml(String(height))}"` : '';
    
    return `<figure class="weave-media weave-embed">
      <iframe src="${escapeHtml(url)}" ${widthAttr} ${heightAttr} frameborder="0" allowfullscreen></iframe>
      ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
    </figure>`;
  } catch {
    return '<div class="weave-media weave-embed weave-error">Invalid embed block</div>';
  }
}

/**
 * Renders a preformatted block
 */
function renderPreBlock(content: string): string {
  return `<div class="weave-preformatted">${escapeHtml(content)}</div>`;
}

/**
 * Processes inline math :math[...] syntax in text
 */
function processInlineMath(text: string, renderMath: boolean): string {
  if (!renderMath) {
    return text.replace(/:math\[([^\]]+)\]/g, (_, mathContent) => {
      return `<code class="weave-math-inline">${escapeHtml(mathContent)}</code>`;
    });
  }
  
  return text.replace(/:math\[([^\]]+)\]/g, (_, mathContent) => {
    return renderMathBlock(mathContent, false);
  });
}

/**
 * Transforms HAST tree to handle Weave-specific elements
 */
function transformHast(tree: HastRoot, options: RenderOptions): HastRoot {
  const renderMath = options.renderMath !== false;
  
  function visit(node: HastRoot | Element | Text): void {
    if (node.type === 'element') {
      const element = node as Element;
      
      // Handle code blocks
      if (element.tagName === 'pre' && element.children.length === 1) {
        const codeChild = element.children[0];
        if (codeChild.type === 'element' && codeChild.tagName === 'code') {
          const className = Array.isArray(codeChild.properties?.className) 
            ? codeChild.properties.className.join(' ') 
            : String(codeChild.properties?.className || '');
          
          const langMatch = className.match(/language-(\w+)/);
          const lang = langMatch ? langMatch[1].toLowerCase() : '';
          
          // Get text content
          const textContent = codeChild.children
            .filter((c): c is Text => c.type === 'text')
            .map(c => c.value)
            .join('');
          
          let replacement: string | null = null;
          
          switch (lang) {
            case 'math':
              replacement = renderMathBlock(textContent, true);
              break;
            case 'image':
              replacement = renderImageBlock(textContent);
              break;
            case 'gallery':
              replacement = renderGalleryBlock(textContent);
              break;
            case 'audio':
              replacement = renderAudioBlock(textContent);
              break;
            case 'video':
              replacement = renderVideoBlock(textContent);
              break;
            case 'embed':
              replacement = renderEmbedBlock(textContent);
              break;
            case 'pre':
              replacement = renderPreBlock(textContent);
              break;
          }
          
          if (replacement) {
            // Replace with raw HTML node
            (element as unknown as { type: string; value: string }).type = 'raw';
            (element as unknown as { type: string; value: string }).value = replacement;
            delete (element as unknown as { children?: unknown[] }).children;
            delete (element as unknown as { tagName?: string }).tagName;
            delete (element as unknown as { properties?: unknown }).properties;
            return;
          }
        }
      }
      
      // Handle node: links - convert to clickable triggers with templates
      if (element.tagName === 'a') {
        const href = element.properties?.href as string | undefined;
        if (href && href.startsWith('node:')) {
          // Parse the node URL
          const urlPart = href.slice(5); // Remove 'node:'
          const [id, queryString] = urlPart.split('?');
          let display = 'overlay'; // Default to overlay for nested links
          if (queryString) {
            const params = new URLSearchParams(queryString);
            display = params.get('display') || 'overlay';
          }
          
          // Get link text from children
          const linkText = element.children
            .filter((c): c is Text => c.type === 'text')
            .map(c => c.value)
            .join('');
          
          // Create trigger element based on display type
          let replacement: string;
          if (display === 'overlay') {
            replacement = `<span class="weave-node-link" data-weave="1" data-target="${escapeHtml(id)}" data-nested="1" tabindex="0" role="button" data-display="overlay">${escapeHtml(linkText)}</span>`;
          } else if (display === 'inline') {
            replacement = `<span class="weave-inline-trigger" data-weave="1" data-target="${escapeHtml(id)}" data-nested="1" tabindex="0" role="button" aria-expanded="false">${escapeHtml(linkText)}</span>`;
          } else {
            // Default to overlay for other display types in nested context
            replacement = `<span class="weave-node-link" data-weave="1" data-target="${escapeHtml(id)}" data-nested="1" tabindex="0" role="button" data-display="overlay">${escapeHtml(linkText)}</span>`;
          }
          
          (element as unknown as { type: string; value: string }).type = 'raw';
          (element as unknown as { type: string; value: string }).value = replacement;
          delete (element as unknown as { children?: unknown[] }).children;
          delete (element as unknown as { tagName?: string }).tagName;
          delete (element as unknown as { properties?: unknown }).properties;
          return;
        }
      }
      
      // Handle inline math in text nodes
      if (element.children) {
        for (let i = 0; i < element.children.length; i++) {
          const child = element.children[i];
          if (child.type === 'text' && child.value.includes(':math[')) {
            const processed = processInlineMath(child.value, renderMath);
            (element.children[i] as unknown as { type: string; value: string }).type = 'raw';
            (element.children[i] as unknown as { type: string; value: string }).value = processed;
          }
        }
      }
      
      // Recurse into children
      if (element.children) {
        element.children.forEach(child => visit(child as Element | Text));
      }
    }
  }
  
  tree.children.forEach(child => visit(child as Element | Text));
  return tree;
}

/**
 * Transforms custom mdast nodes (weaveNodeLink, inlineMath) to HTML-compatible nodes
 * @weave-md/parse creates custom nodes that toHast doesn't handle natively
 */
function transformMdastCustomNodes(tree: unknown, renderMath: boolean): void {
  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    
    const n = node as { type?: string; children?: unknown[]; url?: string; title?: string; value?: string; data?: Record<string, unknown> };
    
    // Recurse into children FIRST (before we might modify them)
    if (Array.isArray(n.children)) {
      n.children.forEach(visit);
    }
    
    // Handle inlineMath nodes created by @weave-md/parse
    if (n.type === 'inlineMath') {
      const mathContent = n.value || '';
      let html: string;
      
      if (renderMath) {
        try {
          const katex = require('katex');
          const rendered = katex.renderToString(mathContent.trim(), {
            displayMode: false,
            throwOnError: false,
            output: 'html'
          });
          html = rendered;
        } catch {
          html = `<code>${escapeHtml(mathContent)}</code>`;
        }
      } else {
        html = `<code>${escapeHtml(mathContent)}</code>`;
      }
      
      // Convert to HTML node - clear data to prevent toHast from using old hName/hProperties
      n.type = 'html';
      n.value = `<span class="weave-math-inline">${html}</span>`;
      delete n.children;
      delete n.data;
    }
    
    if (n.type === 'weaveNodeLink') {
      // weaveNodeLink has targetId and display properties directly
      const nodeLink = n as { type: string; targetId?: string; display?: string; children?: unknown[]; data?: Record<string, unknown> };
      const id = nodeLink.targetId || '';
      const display = nodeLink.display || 'overlay';
      const linkText = nodeLink.children?.map((c: unknown) => {
        const child = c as { type?: string; value?: string };
        return child.type === 'text' ? child.value || '' : '';
      }).join('') || '';
      
      // Use data.hName and data.hProperties to tell toHast how to convert this node
      // This is the proper way to handle custom mdast nodes
      nodeLink.data = {
        hName: 'span',
        hProperties: {
          className: display === 'inline' ? 'weave-inline-trigger' : 'weave-node-link',
          'data-weave': '1',
          'data-target': id,
          'data-nested': '1',
          tabindex: '0',
          role: 'button',
          ...(display === 'inline' 
            ? { 'aria-expanded': 'false' } 
            : { 'data-display': 'overlay' })
        }
      };
      
      // Keep children as text nodes for the link text
      nodeLink.children = [{
        type: 'text',
        value: linkText
      }];
    }
  }
  
  visit(tree);
}

/**
 * Renders Weave markdown content to HTML using @weave-md/parse
 * 
 * This function:
 * 1. Parses markdown to mdast using @weave-md/parse
 * 2. Converts mdast to hast
 * 3. Transforms hast to handle Weave-specific elements
 * 4. Converts hast to HTML string
 */
export function renderWeaveContent(markdown: string, options: RenderOptions = {}): string {
  try {
    // Parse to mdast using @weave-md/parse
    const { tree } = parseToMdast(markdown);
    
    // Transform custom mdast nodes (weaveNodeLink, inlineMath) before converting to hast
    const renderMath = options.renderMath !== false;
    transformMdastCustomNodes(tree, renderMath);
    
    // Convert mdast to hast (allowDangerousHtml needed for html nodes from inlineMath transform)
    const hast = toHast(tree as MdastRoot, { allowDangerousHtml: true }) as HastRoot;
    
    // Transform hast to handle Weave-specific elements
    const transformedHast = transformHast(hast, options);
    
    // Convert to HTML
    let html = toHtml(transformedHast, { allowDangerousHtml: true });
    
    // Truncate if needed
    if (options.maxChars && html.length > options.maxChars) {
      html = html.slice(0, options.maxChars) + '...';
    }
    
    return html;
  } catch (error) {
    console.error('Error rendering Weave content:', error);
    return `<div class="weave-error">Error rendering content</div>`;
  }
}

/**
 * Renders section markdown to HTML
 * Expects full document with frontmatter - shows error if missing
 */
export function renderSectionBody(fullMarkdown: string, options: RenderOptions = {}): string {
  // Check if document has frontmatter
  if (!fullMarkdown.trimStart().startsWith('---')) {
    return `<div class="weave-error">Error: Section is missing YAML frontmatter</div>`;
  }
  return renderWeaveContent(fullMarkdown, options);
}
