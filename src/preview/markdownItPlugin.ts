/**
 * Main markdown-it plugin hook for Weave preview enhancements.
 * Stub implementation - full preview features in separate PR.
 */

import type MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';

/**
 * Preview configuration from VS Code settings
 */
export interface PreviewConfig {
  enablePreviewEnhancements: boolean;
  maxPreviewDepth: number;
  maxExpandedCharsPerRef: number;
  maxExpandedRefsPerDoc: number;
  showPreviewLabels: boolean;
}

/**
 * Gets preview configuration from VS Code settings
 */
export function getPreviewConfig(): PreviewConfig {
  const config = vscode.workspace.getConfiguration('weave');
  return {
    enablePreviewEnhancements: config.get('enablePreviewEnhancements', true),
    maxPreviewDepth: config.get('maxPreviewDepth', 3),
    maxExpandedCharsPerRef: config.get('maxExpandedCharsPerRef', 12000),
    maxExpandedRefsPerDoc: config.get('maxExpandedRefsPerDoc', 50),
    showPreviewLabels: config.get('showPreviewLabels', true)
  };
}

/**
 * Creates the main Weave markdown-it plugin.
 * Stub - full implementation in separate PR.
 */
export function createWeavePlugin(_md: MarkdownIt, _outputChannel?: vscode.OutputChannel): void {
  // Stub - preview enhancements coming in separate PR
}

/**
 * Creates the Weave format block plugin for math/media/etc.
 * Stub - full implementation in separate PR.
 */
export function createWeaveFormatPlugin(_md: MarkdownIt): void {
  // Stub - format block plugin coming in separate PR
}
