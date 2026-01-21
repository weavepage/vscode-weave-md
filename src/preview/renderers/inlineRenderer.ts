/**
 * Inline display renderer for Weave preview
 * Handles display=inline node links
 */

import { escapeHtml, isAnchorOnly, ICON_PLUS, ICON_MINUS } from '../utils';
import type { RenderContext } from '../types';
import { getNestedLinkTemplates } from './nestedTemplates';

/**
 * Renders inline expansion HTML
 */
export function renderInlineExpansion(
  targetId: string,
  linkText: string,
  title: string,
  content: string,
  filePath: string,
  ctx: RenderContext,
  depth: number
): string {
  const contentTemplate = `<template class="weave-inline-content-template" data-for="${targetId}">${content}</template>`;
  const nestedTemplates = getNestedLinkTemplates(content, depth + 1, ctx);
  
  if (isAnchorOnly(linkText)) {
    return `<span class="weave-inline-anchor" data-weave="1" data-target="${targetId}" tabindex="0" role="button" title="Expand ${escapeHtml(title)}">${ICON_PLUS}${ICON_MINUS}</span>${contentTemplate}${nestedTemplates}`;
  }
  
  return `<span class="weave-inline-trigger" data-weave="1" data-target="${targetId}" tabindex="0" role="button" aria-expanded="false">${escapeHtml(linkText)}</span>${contentTemplate}${nestedTemplates}`;
}
