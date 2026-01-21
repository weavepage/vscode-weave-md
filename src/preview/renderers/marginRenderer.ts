/**
 * Margin note display renderer for Weave preview
 * Handles display=margin node links
 */

import { escapeHtml, isAnchorOnly } from '../utils';

/**
 * Renders margin note HTML
 */
export function renderMarginNote(
  targetId: string,
  linkText: string,
  title: string,
  content: string,
  filePath: string
): string {
  const showAnchor = !isAnchorOnly(linkText);
  return `<span class="weave-margin-note-container" data-weave="1">
    ${showAnchor ? `<span class="weave-margin-note-anchor" data-target="${targetId}" tabindex="0" role="button">${escapeHtml(linkText)}</span>` : ''}
    <span class="weave-margin-note-body" data-target="${targetId}">
      <span class="weave-margin-note-content">
        <span class="weave-header">
          <span class="weave-title">${escapeHtml(title)}</span>
          <a class="weave-open-link" href="${escapeHtml(filePath)}" title="Open section">↗</a>
        </span>
        ${content}
      </span>
    </span>
  </span>`;
}
