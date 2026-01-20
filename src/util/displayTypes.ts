/**
 * Display type utilities using @weave-md/core's DisplayType
 */

import { DisplayType, ExportHint } from '@weave-md/core';

/**
 * All valid display modes from @weave-md/core
 */
export const VALID_DISPLAY_MODES: DisplayType[] = ['inline', 'stretch', 'overlay', 'footnote', 'sidenote', 'margin', 'panel'];

/**
 * All valid export hints from @weave-md/core
 */
export const VALID_EXPORT_HINTS: ExportHint[] = ['appendix', 'inline', 'omit'];

/**
 * Checks if a value is a valid DisplayType
 */
export function isValidDisplayType(value: string): value is DisplayType {
  return VALID_DISPLAY_MODES.includes(value as DisplayType);
}

/**
 * Gets all valid display modes as a comma-separated string for error messages
 */
export function getValidDisplayModesString(): string {
  return VALID_DISPLAY_MODES.join(', ');
}
