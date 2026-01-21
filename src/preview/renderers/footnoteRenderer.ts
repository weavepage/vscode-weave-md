/**
 * Footnote display renderer for Weave preview
 * Handles display=footnote node links
 */

import { escapeHtml } from '../utils';
import type { RenderContext } from '../types';
import { getNestedLinkTemplates } from './nestedTemplates';

/**
 * Renders a footnote reference (inline superscript) and collects the footnote for later rendering
 */
export function renderFootnoteRef(
  targetId: string,
  linkText: string,
  title: string,
  content: string,
  ctx: RenderContext
): string {
  ctx.footnoteRefCount++;
  const refId = `fnref-${ctx.footnoteRefCount}`;
  
  let entry = ctx.footnotes.get(targetId);
  if (!entry) {
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
  
  entry.refIds.push(refId);
  const fnNum = entry.num;
  
  if (linkText && linkText.trim() && linkText.trim() !== ' ') {
    return `<a href="#fn-${fnNum}" id="${refId}" class="weave-footnote-link" data-weave="1"><span class="weave-footnote-link-text">${escapeHtml(linkText)}</span><sup>[${fnNum}]</sup></a>`;
  } else {
    return `<sup class="weave-footnote-ref" data-weave="1"><a href="#fn-${fnNum}" id="${refId}">[${fnNum}]</a></sup>`;
  }
}

/**
 * Renders all collected footnotes as a section at the bottom
 */
export function renderFootnotesSection(ctx: RenderContext): string {
  if (ctx.footnotes.size === 0) {
    return '';
  }
  
  let nestedTemplates = '';
  
  const footnotesList = Array.from(ctx.footnotes.values())
    .sort((a, b) => a.num - b.num)
    .map(fn => {
      const backrefId = fn.refIds[0] || '';
      nestedTemplates += getNestedLinkTemplates(fn.content, 1, ctx);
      return `<li id="fn-${fn.num}" class="weave-footnote"><span class="weave-footnote-marker"><a href="#${backrefId}" class="weave-footnote-backref">[${fn.num}]</a></span><div class="weave-footnote-content">${fn.content}</div></li>`;
    })
    .join('');
  
  return `<hr class="weave-footnotes-separator"><section class="weave-footnotes" data-weave="1"><ol class="weave-footnotes-list">${footnotesList}</ol></section>${nestedTemplates}`;
}
