/**
 * Sidenote display renderer for Weave preview
 * Handles display=sidenote node links
 */

import { escapeHtml } from '../utils';

/**
 * Renders sidenote HTML
 * Uses a template for mobile expansion (instantiated after paragraph by JS)
 * and a float body for desktop margin display
 */
export function renderSidenote(
  targetId: string,
  linkText: string,
  title: string,
  content: string,
  filePath: string,
  num: number
): string {
  const bodyContent = `
      <span class="weave-sidenote-content">
        <span class="weave-header">
          <span class="weave-sidenote-number">${num}.</span>
          <span class="weave-title">${escapeHtml(title)}</span>
          <a class="weave-open-link" href="${escapeHtml(filePath)}" title="Open section">↗</a>
        </span>
        ${content}
      </span>`;
  
  // Template for mobile expansion (JS will instantiate after paragraph)
  const mobileTemplate = `<template class="weave-sidenote-content-template" data-for="${targetId}">${bodyContent}</template>`;
  
  // Float body for desktop margin display
  const desktopBody = `<span class="weave-sidenote-body" data-target="${targetId}">${bodyContent}</span>`;
  
  return `<span class="weave-sidenote-container" data-weave="1" data-num="${num}">
    <span class="weave-sidenote-anchor" data-target="${targetId}" tabindex="0" role="button">
      ${escapeHtml(linkText)}<sup class="weave-sidenote-number">[${num}]</sup>
    </span>
    ${desktopBody}
  </span>${mobileTemplate}`;
}
