/**
 * Nested link template generation for Weave preview
 * Scans content for nested node links and renders templates for their content
 */

import type { RenderContext } from '../types';
import { getIndexStore } from '../../validation/indexStore';
import { renderSectionBody as renderSectionBodyHtml } from '../weaveRenderer';

/**
 * Scans content for nested node links and renders templates for their content
 */
export function getNestedLinkTemplates(content: string, depth: number, ctx: RenderContext): string {
  const regex = /data-target="([^"]+)"\s+data-nested="1"/g;
  const templates: string[] = [];
  const processedIds = new Set<string>();
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    const nestedId = match[1];
    
    if (processedIds.has(nestedId) || ctx.expandedIds.has(nestedId)) {
      continue;
    }
    processedIds.add(nestedId);
    
    if (depth > ctx.config.maxPreviewDepth) {
      continue;
    }
    
    const nestedSection = getIndexStore().getSectionById(nestedId);
    if (!nestedSection) {
      continue;
    }
    
    ctx.expandedIds.add(nestedId);
    const nestedContent = renderSectionBodyHtml(nestedSection.fullMarkdown, {
      renderMath: true,
      maxChars: ctx.config.maxExpandedCharsPerRef
    });
    ctx.expandedIds.delete(nestedId);
    
    templates.push(`<template class="weave-overlay-content-template" data-for="${nestedId}">${nestedContent}</template>`);
  }
  
  return templates.join('');
}
