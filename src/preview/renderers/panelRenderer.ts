/**
 * Panel display renderer for Weave preview
 * Handles display=panel node links
 */

import { escapeHtml, isAnchorOnly, ICON_INFO } from '../utils';
import type { RenderContext } from '../types';
import { getNestedLinkTemplates } from './nestedTemplates';

/**
 * Renders panel expansion HTML
 */
export function renderPanelExpansion(
  targetId: string,
  linkText: string,
  title: string,
  content: string,
  filePath: string,
  ctx: RenderContext,
  depth: number
): string {
  const contentTemplate = `<template class="weave-panel-content-template" data-for="${targetId}">${content}</template>`;
  const nestedTemplates = getNestedLinkTemplates(content, depth + 1, ctx);
  
  if (isAnchorOnly(linkText)) {
    return `<span class="weave-panel-anchor" data-weave="1" data-target="${targetId}" tabindex="0" role="button" title="Open panel: ${escapeHtml(title)}">${ICON_INFO}</span>${contentTemplate}${nestedTemplates}`;
  }
  
  return `<span class="weave-panel-trigger" data-weave="1" data-target="${targetId}" tabindex="0" role="button" aria-expanded="false">${escapeHtml(linkText)}</span>${contentTemplate}${nestedTemplates}`;
}
