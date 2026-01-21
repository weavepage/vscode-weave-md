/**
 * Overlay display renderer for Weave preview
 * Handles display=overlay node links
 */

import { escapeHtml, isAnchorOnly, ICON_INFO } from '../utils';
import type { RenderContext } from '../types';
import { getNestedLinkTemplates } from './nestedTemplates';

/**
 * Renders overlay expansion HTML
 */
export function renderOverlayExpansion(
  targetId: string,
  linkText: string,
  title: string,
  content: string,
  filePath: string,
  ctx: RenderContext,
  depth: number
): string {
  const contentTemplate = `<template class="weave-overlay-content-template" data-for="${targetId}">${content}</template>`;
  const nestedTemplates = getNestedLinkTemplates(content, depth + 1, ctx);
  
  if (isAnchorOnly(linkText)) {
    return `<span class="weave-overlay-anchor" data-weave="1" data-target="${targetId}" tabindex="0" role="button" data-display="overlay" title="View ${escapeHtml(title)}">${ICON_INFO}</span>${contentTemplate}${nestedTemplates}`;
  }
  
  return `<span class="weave-node-link" data-weave="1" data-target="${targetId}" tabindex="0" role="button" data-display="overlay">${escapeHtml(linkText)}</span>${contentTemplate}${nestedTemplates}`;
}
