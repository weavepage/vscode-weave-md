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
  // Match nested links - find spans with data-nested="1" attribute
  const regex = /<span[^>]*data-nested="1"[^>]*>/g;
  const templates: string[] = [];
  const processedIds = new Set<string>();
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    const spanTag = match[0];
    
    // Extract target ID
    const targetMatch = spanTag.match(/data-target="([^"]+)"/);
    if (!targetMatch) continue;
    const nestedId = targetMatch[1];
    
    // Determine display type from class or data-display attribute
    const isStretch = spanTag.includes('weave-stretch-trigger');
    const displayMatch = spanTag.match(/data-display="([^"]*)"/);
    const displayType = isStretch ? 'stretch' : (displayMatch?.[1] || 'overlay');
    
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
    
    // Recursively generate templates for nested links within this content
    const deeperTemplates = getNestedLinkTemplates(nestedContent, depth + 1, ctx);
    
    ctx.expandedIds.delete(nestedId);
    
    // Use correct template class based on display type
    const templateClass = displayType === 'stretch' ? 'weave-stretch-content-template' : 'weave-overlay-content-template';
    templates.push(`<template class="${templateClass}" data-for="${nestedId}">${nestedContent}</template>`);
    templates.push(deeperTemplates);
  }
  
  return templates.join('');
}
