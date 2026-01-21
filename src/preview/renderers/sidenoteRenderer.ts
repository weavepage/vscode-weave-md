/**
 * Sidenote display renderer for Weave preview
 * Handles display=sidenote node links
 */

import { escapeHtml } from '../utils';

/**
 * Renders sidenote HTML
 */
export function renderSidenote(
  targetId: string,
  linkText: string,
  title: string,
  content: string,
  filePath: string,
  num: number
): string {
  return `<span class="weave-sidenote-container" data-weave="1">
    <span class="weave-sidenote-anchor" data-target="${targetId}" tabindex="0" role="button">
      ${escapeHtml(linkText)}<sup class="weave-sidenote-number">[${num}]</sup>
    </span>
    <span class="weave-sidenote-body" data-target="${targetId}">
      <span class="weave-sidenote-content">
        <span class="weave-header">
          <span class="weave-sidenote-number">${num}.</span>
          <span class="weave-title">${escapeHtml(title)}</span>
          <a class="weave-open-link" href="${escapeHtml(filePath)}" title="Open section">↗</a>
        </span>
        ${content}
      </span>
    </span>
  </span>`;
}
