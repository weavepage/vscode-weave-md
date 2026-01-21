/**
 * Inline substitution renderer for Weave preview
 * Handles :sub[INITIAL]{REPLACEMENT} syntax
 */

import { escapeHtml } from '../utils';

/**
 * Processes inline math syntax :math[...] in text content
 */
export function processInlineMath(text: string): string {
  return text.replace(/:math\[([^\]]+)\]/g, (match, mathContent) => {
    try {
      const katex = require('katex');
      const html = katex.renderToString(mathContent.trim(), {
        displayMode: false,
        throwOnError: false,
        output: 'html'
      });
      return `<span class="weave-math weave-math-inline" data-weave="1">${html}</span>`;
    } catch {
      return `<span class="weave-math weave-math-inline weave-math-error" data-weave="1">
        <code>${escapeHtml(mathContent)}</code>
        <span class="weave-error">Math error</span>
      </span>`;
    }
  });
}

/**
 * Processes inline substitution syntax :sub[INITIAL]{REPLACEMENT} in text content
 * Handles nested sub syntax in replacement content
 */
export function processInlineSub(text: string): string {
  let subIndex = 0;
  
  function parseSubAtPosition(startIndex: number): { match: string; initial: string; replacement: string; endIndex: number } | null {
    if (!text.startsWith(':sub[', startIndex)) {
      return null;
    }
    
    let pos = startIndex + 5;
    
    let initial = '';
    let braceCount = 0;
    while (pos < text.length) {
      if (text[pos] === ']' && braceCount === 0) {
        break;
      } else if (text[pos] === '{') {
        braceCount++;
      } else if (text[pos] === '}') {
        if (braceCount > 0) braceCount--;
      }
      initial += text[pos];
      pos++;
    }
    
    if (pos >= text.length || text[pos] !== ']') {
      return null;
    }
    
    pos++;
    
    if (pos >= text.length || text[pos] !== '{') {
      return null;
    }
    
    pos++;
    
    let replacement = '';
    braceCount = 1;
    
    while (pos < text.length && braceCount > 0) {
      if (text[pos] === '{') {
        braceCount++;
      } else if (text[pos] === '}') {
        braceCount--;
      }
      
      if (braceCount > 0) {
        replacement += text[pos];
      }
      pos++;
    }
    
    if (braceCount !== 0) {
      return null;
    }
    
    const match = text.substring(startIndex, pos);
    return { match, initial, replacement, endIndex: pos };
  }
  
  let result = '';
  let pos = 0;
  
  while (pos < text.length) {
    const parsed = parseSubAtPosition(pos);
    
    if (parsed) {
      const id = `weave-sub-${subIndex++}`;
      
      let processedReplacement = parsed.replacement;
      if (/:sub\[/.test(parsed.replacement)) {
        processedReplacement = processInlineSub(parsed.replacement);
      }
      
      const escapedInitial = escapeHtml(parsed.initial);
      const replacementContent = processedReplacement.includes('<span class="weave-sub') 
        ? processedReplacement 
        : escapeHtml(processedReplacement);
      
      result += `<span class="weave-sub weave-sub-inline" data-weave="1" data-sub-id="${id}" data-initial="${escapedInitial}" data-replacement="${escapeHtml(parsed.replacement)}">
        <span class="weave-sub-content weave-sub-initial">${escapedInitial}</span>
        <span class="weave-sub-content weave-sub-replacement" style="display: none;">${replacementContent}</span>
      </span>`;
      
      pos = parsed.endIndex;
    } else {
      result += text[pos];
      pos++;
    }
  }
  
  return result;
}
