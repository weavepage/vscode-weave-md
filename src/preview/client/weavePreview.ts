/**
 * Weave Preview Client Script
 * 
 * Constraints (from plan):
 * - Scripts must be idempotent and use event delegation
 * - Scripts must only interact with DOM elements created by Weave (e.g. .weave-*)
 * - Must not mutate or reparent nodes created by other renderers
 * - No runtime fetch/RPC - scripts only manipulate DOM
 */

// Make this file a module so we can augment the global scope
export {};

declare global {
  interface Window {
    __weavePreviewInitialized?: boolean;
  }
}

(function(): void {
  'use strict';

  // Idempotency check - only initialize once
  if (window.__weavePreviewInitialized) {
    return;
  }
  window.__weavePreviewInitialized = true;

  // Sidenote configuration
  const MIN_WIDTH_FOR_SIDENOTES = 900;
  
  // Track sidenote block elements created for narrow viewport
  const sidenoteBlocks: Map<string, HTMLElement> = new Map();

  /**
   * Updates sidenote display mode based on viewport width.
   * Wide viewport: sidenotes float in right margin (CSS handles this)
   * Narrow viewport: sidenotes appear as blocks after their containing paragraph
   */
  function updateSidenoteMode(): void {
    const isNarrow = window.innerWidth < MIN_WIDTH_FOR_SIDENOTES;
    
    if (isNarrow) {
      // Collect all sidenotes grouped by their containing paragraph
      const sidenotesByParagraph = new Map<Element, Array<{targetId: string, body: HTMLElement}>>();
      
      document.querySelectorAll<HTMLElement>('.weave-sidenote-container').forEach(container => {
        const anchor = container.querySelector<HTMLElement>('.weave-sidenote-anchor');
        const body = container.querySelector<HTMLElement>('.weave-sidenote-body');
        if (!anchor || !body) return;
        
        const targetId = anchor.getAttribute('data-target');
        if (!targetId) return;
        
        // Skip if block already exists
        if (sidenoteBlocks.has(targetId)) return;
        
        // Find the containing paragraph (be specific - avoid generic divs)
        const paragraph = container.closest('p, li, blockquote');
        if (!paragraph || !paragraph.parentElement) return;
        
        // Group by paragraph
        if (!sidenotesByParagraph.has(paragraph)) {
          sidenotesByParagraph.set(paragraph, []);
        }
        sidenotesByParagraph.get(paragraph)!.push({targetId, body});
      });
      
      // Insert sidenote blocks after each paragraph
      sidenotesByParagraph.forEach((sidenotes, paragraph) => {
        // Find insertion point - after paragraph or after last sidenote block for this paragraph
        let insertAfter: Element = paragraph;
        
        // Check if there are already sidenote blocks after this paragraph
        let nextSibling = paragraph.nextElementSibling;
        while (nextSibling && nextSibling.classList.contains('weave-sidenote-block')) {
          insertAfter = nextSibling;
          nextSibling = nextSibling.nextElementSibling;
        }
        
        // Insert each sidenote block
        sidenotes.forEach(({targetId, body}) => {
          const block = document.createElement('div');
          block.className = 'weave-sidenote-block';
          block.setAttribute('data-sidenote-for', targetId);
          block.innerHTML = body.innerHTML;
          
          // Insert after the current insertion point
          if (insertAfter.nextSibling) {
            insertAfter.parentElement!.insertBefore(block, insertAfter.nextSibling);
          } else {
            insertAfter.parentElement!.appendChild(block);
          }
          insertAfter = block;
          sidenoteBlocks.set(targetId, block);
        });
      });
    } else {
      // Remove block sidenotes - CSS will show the floating ones
      sidenoteBlocks.forEach((block, targetId) => {
        block.remove();
        sidenoteBlocks.delete(targetId);
      });
    }
  }

  /**
   * Handles expand/collapse for inline triggers (text links)
   */
  function handleInlineTrigger(trigger: HTMLElement): void {
    const targetId = trigger.getAttribute('data-target');
    
    // Find or create content element from template
    let content = document.querySelector<HTMLElement>('.weave-inline-content[data-for="' + targetId + '"]');
    if (!content) {
      // Look for template and create content from it
      const template = document.querySelector<HTMLTemplateElement>('template.weave-inline-content-template[data-for="' + targetId + '"]');
      if (template) {
        content = document.createElement('div');
        content.className = 'weave-inline-content';
        content.setAttribute('data-for', targetId ?? '');
        content.innerHTML = template.innerHTML;
        // Insert after the trigger's parent paragraph
        const paragraph = trigger.closest('p');
        if (paragraph && paragraph.parentElement) {
          paragraph.parentElement.insertBefore(content, paragraph.nextSibling);
        } else if (trigger.parentElement) {
          trigger.parentElement.appendChild(content);
        }
      }
    }
    
    if (!content) {
      return;
    }

    const isExpanded = trigger.classList.contains('expanded');

    if (isExpanded) {
      content.classList.remove('visible');
      trigger.classList.remove('expanded');
      trigger.setAttribute('aria-expanded', 'false');
    } else {
      content.classList.add('visible');
      trigger.classList.add('expanded');
      trigger.setAttribute('aria-expanded', 'true');
    }
  }

  /**
   * Handles expand/collapse for inline anchor icons
   */
  function handleInlineAnchor(anchor: HTMLElement): void {
    const targetId = anchor.getAttribute('data-target');
    
    // Find or create content element from template
    let content = document.querySelector<HTMLElement>('.weave-inline-content[data-for="' + targetId + '"]');
    if (!content) {
      // Look for template and create content from it
      const template = document.querySelector<HTMLTemplateElement>('template.weave-inline-content-template[data-for="' + targetId + '"]');
      if (template) {
        content = document.createElement('div');
        content.className = 'weave-inline-content';
        content.setAttribute('data-for', targetId ?? '');
        content.innerHTML = template.innerHTML;
        // Insert after the anchor's parent paragraph
        const paragraph = anchor.closest('p');
        if (paragraph && paragraph.parentElement) {
          paragraph.parentElement.insertBefore(content, paragraph.nextSibling);
        } else if (anchor.parentElement) {
          anchor.parentElement.appendChild(content);
        }
      }
    }
    
    if (!content) {
      return;
    }

    const isExpanded = anchor.classList.contains('expanded');

    if (isExpanded) {
      content.classList.remove('visible');
      anchor.classList.remove('expanded');
    } else {
      content.classList.add('visible');
      anchor.classList.add('expanded');
    }
  }

  /**
   * Handles expand/collapse for stretch triggers (text links with nesting support)
   */
  function handleStretchTrigger(trigger: HTMLElement): void {
    const targetId = trigger.getAttribute('data-target');
    
    // Find or create content element from template
    let content = document.querySelector<HTMLElement>('.weave-stretch-content[data-for="' + targetId + '"]');
    if (!content) {
      // Look for template and create content from it
      const template = document.querySelector<HTMLTemplateElement>('template.weave-stretch-content-template[data-for="' + targetId + '"]');
      if (template) {
        content = document.createElement('div');
        content.className = 'weave-stretch-content';
        content.setAttribute('data-for', targetId ?? '');
        content.innerHTML = template.innerHTML;
        // Insert after the trigger's parent paragraph
        const paragraph = trigger.closest('p');
        if (paragraph && paragraph.parentElement) {
          paragraph.parentElement.insertBefore(content, paragraph.nextSibling);
        } else if (trigger.parentElement) {
          trigger.parentElement.appendChild(content);
        }
      }
    }
    
    if (!content) {
      return;
    }

    const isExpanded = trigger.classList.contains('expanded');

    if (isExpanded) {
      content.classList.remove('visible');
      trigger.classList.remove('expanded');
      trigger.setAttribute('aria-expanded', 'false');
    } else {
      content.classList.add('visible');
      trigger.classList.add('expanded');
      trigger.setAttribute('aria-expanded', 'true');
    }
  }

  /**
   * Handles expand/collapse for stretch anchor icons
   */
  function handleStretchAnchor(anchor: HTMLElement): void {
    const targetId = anchor.getAttribute('data-target');
    
    // Find or create content element from template
    let content = document.querySelector<HTMLElement>('.weave-stretch-content[data-for="' + targetId + '"]');
    if (!content) {
      // Look for template and create content from it
      const template = document.querySelector<HTMLTemplateElement>('template.weave-stretch-content-template[data-for="' + targetId + '"]');
      if (template) {
        content = document.createElement('div');
        content.className = 'weave-stretch-content';
        content.setAttribute('data-for', targetId ?? '');
        content.innerHTML = template.innerHTML;
        // Insert after the anchor's parent paragraph
        const paragraph = anchor.closest('p');
        if (paragraph && paragraph.parentElement) {
          paragraph.parentElement.insertBefore(content, paragraph.nextSibling);
        } else if (anchor.parentElement) {
          anchor.parentElement.appendChild(content);
        }
      }
    }
    
    if (!content) {
      return;
    }

    const isExpanded = anchor.classList.contains('expanded');

    if (isExpanded) {
      content.classList.remove('visible');
      anchor.classList.remove('expanded');
    } else {
      content.classList.add('visible');
      anchor.classList.add('expanded');
    }
  }

  /**
   * Handles overlay show/hide
   */
  function handleOverlay(trigger: HTMLElement, show: boolean): void {
    const targetId = trigger.getAttribute('data-target');
    const isNested = trigger.getAttribute('data-nested') === '1';
    
    // Find or create content element from template
    let content = document.querySelector<HTMLElement>('.weave-overlay-content[data-for="' + targetId + '"]');
    if (!content) {
      // Look for overlay template first
      let template = document.querySelector<HTMLTemplateElement>('template.weave-overlay-content-template[data-for="' + targetId + '"]');
      
      // If not found, try inline template (content is the same)
      if (!template) {
        template = document.querySelector<HTMLTemplateElement>('template.weave-inline-content-template[data-for="' + targetId + '"]');
      }
      
      if (template) {
        content = document.createElement('div');
        content.className = 'weave-overlay-content';
        content.setAttribute('data-for', targetId ?? '');
        content.innerHTML = '<div class="weave-overlay-body">' + template.innerHTML + '</div>';
        document.body.appendChild(content);
      } else if (isNested) {
        // For nested links without templates, create placeholder
        content = document.createElement('div');
        content.className = 'weave-overlay-content';
        content.setAttribute('data-for', targetId ?? '');
        content.innerHTML = '<div class="weave-overlay-body"><p><em>Content for "' + targetId + '" - expand from main document to view.</em></p></div>';
        document.body.appendChild(content);
      }
    }
    
    if (!content) {
      return;
    }

    if (show) {
      content.classList.add('active');
      // Use setTimeout to ensure display change happens before positioning
      setTimeout(function(): void {
        positionOverlay(trigger, content!);
      }, 0);
    } else {
      content.classList.remove('active');
    }
  }

  /**
   * Positions an overlay relative to its trigger
   */
  function positionOverlay(trigger: HTMLElement, overlay: HTMLElement): void {
    const triggerRect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Reset positioning
    overlay.style.left = '';
    overlay.style.right = '';
    overlay.style.top = '';
    overlay.style.bottom = '';

    // Get overlay dimensions after making visible
    const overlayRect = overlay.getBoundingClientRect();

    // Position below trigger by default
    let top = triggerRect.bottom + 10;
    let left = triggerRect.left + (triggerRect.width / 2) - (overlayRect.width / 2);

    // Adjust if would overflow right
    if (left + overlayRect.width > viewportWidth - 16) {
      left = Math.max(16, viewportWidth - overlayRect.width - 16);
    }

    // Adjust if would overflow left
    if (left < 16) {
      left = 16;
    }

    // Adjust if would overflow bottom - show above instead
    if (top + overlayRect.height > viewportHeight - 16) {
      top = Math.max(16, triggerRect.top - overlayRect.height - 10);
    }

    overlay.style.position = 'fixed';
    overlay.style.left = left + 'px';
    overlay.style.top = top + 'px';
  }

  /**
   * Closes all open overlays
   */
  function closeAllOverlays(): void {
    document.querySelectorAll<HTMLElement>('.weave-overlay-content.active').forEach(function(overlay): void {
      overlay.classList.remove('active');
    });
  }

  /**
   * Closes all open panels
   */
  function closeAllPanels(): void {
    document.querySelectorAll<HTMLElement>('.weave-panel-content.visible').forEach(function(panel): void {
      panel.classList.remove('visible');
      // Update trigger state
      const targetId = panel.getAttribute('data-for');
      if (targetId) {
        const trigger = document.querySelector<HTMLElement>('.weave-panel-trigger[data-target="' + targetId + '"]');
        if (trigger) {
          trigger.classList.remove('expanded');
          trigger.setAttribute('aria-expanded', 'false');
        }
      }
    });
  }

  /**
   * Handles panel show/hide
   */
  function handlePanel(trigger: HTMLElement): void {
    const targetId = trigger.getAttribute('data-target');
    
    // Find or create content element from template
    let content = document.querySelector<HTMLElement>('.weave-panel-content[data-for="' + targetId + '"]');
    if (!content) {
      // Look for panel template
      const template = document.querySelector<HTMLTemplateElement>('template.weave-panel-content-template[data-for="' + targetId + '"]');
      if (template) {
        content = document.createElement('div');
        content.className = 'weave-panel-content';
        content.setAttribute('data-for', targetId ?? '');
        
        // Extract title from trigger or use default
        const title = trigger.getAttribute('title') || 'Panel';
        const cleanTitle = title.replace(/^Open panel:\s*/, '');
        
        content.innerHTML = `
          <div class="weave-panel-header">
            <h3 class="weave-panel-title">${cleanTitle}</h3>
            <button class="weave-panel-close" type="button" aria-label="Close panel">×</button>
          </div>
          <div class="weave-panel-body">${template.innerHTML}</div>
        `;
        document.body.appendChild(content);
        
        // Add close button handler
        const closeBtn = content.querySelector('.weave-panel-close');
        if (closeBtn) {
          closeBtn.addEventListener('click', function(): void {
            closeAllPanels();
          });
        }
      }
    }
    
    if (!content) {
      return;
    }

    const isVisible = content.classList.contains('visible');
    
    // Close all other panels first
    closeAllPanels();
    
    if (!isVisible) {
      content.classList.add('visible');
      if (trigger.classList.contains('weave-panel-trigger')) {
        trigger.classList.add('expanded');
        trigger.setAttribute('aria-expanded', 'true');
      }
    }
  }

  /**
   * Handles sidenote anchor clicks - scroll to and highlight margin note
   */
  function handleSidenoteClick(anchor: HTMLElement): void {
    const targetId = anchor.getAttribute('data-target');
    if (!targetId) return;
    
    // Find the corresponding sidenote body
    const sidenoteBody = document.querySelector<HTMLElement>('.weave-sidenote-body[data-target="' + targetId + '"]');
    if (!sidenoteBody) return;
    
    // Prevent default and stop propagation
    event?.preventDefault();
    event?.stopPropagation();
    
    // Remove any existing highlights
    document.querySelectorAll<HTMLElement>('.weave-sidenote-body.weave-highlight').forEach(el => {
      el.classList.remove('weave-highlight');
    });
    
    // Add highlight class and scroll into view
    sidenoteBody.classList.add('weave-highlight');
    sidenoteBody.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Remove highlight after 2 seconds
    setTimeout(function(): void {
      sidenoteBody.classList.remove('weave-highlight');
    }, 2000);
  }

  /**
   * Handles margin note anchor clicks - scroll to and highlight margin note
   */
  function handleMarginNoteClick(anchor: HTMLElement): void {
    const targetId = anchor.getAttribute('data-target');
    if (!targetId) return;
    
    // Find the corresponding margin note body
    const marginNoteBody = document.querySelector<HTMLElement>('.weave-margin-note-body[data-target="' + targetId + '"]');
    if (!marginNoteBody) return;
    
    // Prevent default and stop propagation
    event?.preventDefault();
    event?.stopPropagation();
    
    // Remove any existing highlights
    document.querySelectorAll<HTMLElement>('.weave-margin-note-body.weave-highlight').forEach(el => {
      el.classList.remove('weave-highlight');
    });
    
    // Add highlight class and scroll into view
    marginNoteBody.classList.add('weave-highlight');
    marginNoteBody.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Remove highlight after 2 seconds
    setTimeout(function(): void {
      marginNoteBody.classList.remove('weave-highlight');
    }, 2000);
  }

  /**
   * Handles sidenote/margin note body clicks - scroll to and highlight anchor
   */
  function handleNoteBodyClick(body: HTMLElement): void {
    const targetId = body.getAttribute('data-target');
    if (!targetId) return;
    
    // Find the corresponding anchor
    let anchor: HTMLElement | null = null;
    
    // Try sidenote anchor first
    anchor = document.querySelector<HTMLElement>('.weave-sidenote-anchor[data-target="' + targetId + '"]');
    
    // If not found, try margin note anchor
    if (!anchor) {
      anchor = document.querySelector<HTMLElement>('.weave-margin-note-anchor[data-target="' + targetId + '"]');
    }
    
    if (!anchor) return;
    
    // Prevent default and stop propagation
    event?.preventDefault();
    event?.stopPropagation();
    
    // Remove any existing highlights
    document.querySelectorAll<HTMLElement>('.weave-sidenote-anchor.weave-highlight, .weave-margin-note-anchor.weave-highlight').forEach(el => {
      el.classList.remove('weave-highlight');
    });
    
    // Add highlight class and scroll into view
    anchor.classList.add('weave-highlight');
    anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Remove highlight after 2 seconds
    setTimeout(function(): void {
      anchor.classList.remove('weave-highlight');
    }, 2000);
  }

  /**
   * Event delegation handler for clicks
   */
  function handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Handle sidenote anchor clicks
    const sidenoteAnchor = target.closest<HTMLElement>('.weave-sidenote-anchor');
    if (sidenoteAnchor) {
      handleSidenoteClick(sidenoteAnchor);
      return;
    }

    // Handle margin note anchor clicks
    const marginNoteAnchor = target.closest<HTMLElement>('.weave-margin-note-anchor');
    if (marginNoteAnchor) {
      handleMarginNoteClick(marginNoteAnchor);
      return;
    }

    // Handle sidenote/margin note body clicks
    const noteBody = target.closest<HTMLElement>('.weave-sidenote-body, .weave-margin-note-body');
    if (noteBody) {
      handleNoteBodyClick(noteBody);
      return;
    }

    // Handle inline trigger clicks (text links)
    const inlineTrigger = target.closest<HTMLElement>('.weave-inline-trigger');
    if (inlineTrigger) {
      event.preventDefault();
      handleInlineTrigger(inlineTrigger);
      return;
    }

    // Handle inline anchor clicks (icon-only)
    const inlineAnchor = target.closest<HTMLElement>('.weave-inline-anchor');
    if (inlineAnchor) {
      event.preventDefault();
      handleInlineAnchor(inlineAnchor);
      return;
    }

    // Handle stretch trigger clicks (text links with nesting)
    const stretchTrigger = target.closest<HTMLElement>('.weave-stretch-trigger');
    if (stretchTrigger) {
      event.preventDefault();
      handleStretchTrigger(stretchTrigger);
      return;
    }

    // Handle stretch anchor clicks (icon-only with nesting)
    const stretchAnchor = target.closest<HTMLElement>('.weave-stretch-anchor');
    if (stretchAnchor) {
      event.preventDefault();
      handleStretchAnchor(stretchAnchor);
      return;
    }

    // Handle overlay anchor clicks (icon-only)
    const overlayAnchor = target.closest<HTMLElement>('.weave-overlay-anchor');
    if (overlayAnchor) {
      event.preventDefault();
      event.stopPropagation();
      // Content is sibling, not nested
      let content = overlayAnchor.nextElementSibling as HTMLElement | null;
      if (!content || !content.classList.contains('weave-overlay-content')) {
        const targetId = overlayAnchor.getAttribute('data-target');
        content = document.querySelector<HTMLElement>('.weave-overlay-content[data-for="' + targetId + '"]');
      }
      const isVisible = content && content.classList.contains('active');
      
      closeAllOverlays();
      
      if (!isVisible) {
        handleOverlay(overlayAnchor, true);
      }
      return;
    }

    // Handle overlay trigger clicks (node-link with overlay display)
    const overlayTrigger = target.closest<HTMLElement>('.weave-node-link[data-display="overlay"]');
    if (overlayTrigger) {
      event.preventDefault();
      event.stopPropagation();
      // Content is sibling, not nested
      let content = overlayTrigger.nextElementSibling as HTMLElement | null;
      if (!content || !content.classList.contains('weave-overlay-content')) {
        const targetId = overlayTrigger.getAttribute('data-target');
        content = document.querySelector<HTMLElement>('.weave-overlay-content[data-for="' + targetId + '"]');
      }
      const isVisible = content && content.classList.contains('active');
      
      closeAllOverlays();
      
      if (!isVisible) {
        handleOverlay(overlayTrigger, true);
      }
      return;
    }

    // Handle panel anchor clicks (icon-only)
    const panelAnchor = target.closest<HTMLElement>('.weave-panel-anchor');
    if (panelAnchor) {
      event.preventDefault();
      event.stopPropagation();
      handlePanel(panelAnchor);
      return;
    }

    // Handle panel trigger clicks (text links)
    const panelTrigger = target.closest<HTMLElement>('.weave-panel-trigger');
    if (panelTrigger) {
      event.preventDefault();
      event.stopPropagation();
      handlePanel(panelTrigger);
      return;
    }

    // Handle YouTube embed play button clicks - replace thumbnail with iframe
    const playButton = target.closest<HTMLElement>('.weave-embed-play-button');
    if (playButton) {
      event.preventDefault();
      const container = playButton.closest<HTMLElement>('.weave-embed-container');
      if (container) {
        const embedUrl = container.getAttribute('data-embed-url');
        if (embedUrl) {
          const iframe = document.createElement('iframe');
          iframe.src = embedUrl;
          iframe.setAttribute('frameborder', '0');
          iframe.setAttribute('allowfullscreen', '');
          iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
          iframe.className = 'weave-embed-iframe';
          container.innerHTML = '';
          container.appendChild(iframe);
          container.classList.add('weave-embed-playing');
        }
      }
      return;
    }

    // Handle footnote reference clicks (jump to footnote at bottom)
    const fnRefLink = target.closest<HTMLAnchorElement>('.weave-footnote-link, .weave-footnote-ref a');
    if (fnRefLink) {
      const href = fnRefLink.getAttribute('href');
      if (href && href.startsWith('#fn-')) {
        event.preventDefault();
        const footnote = document.querySelector<HTMLElement>(href);
        if (footnote) {
          footnote.scrollIntoView({ behavior: 'smooth', block: 'center' });
          footnote.classList.add('weave-footnote-highlight');
          setTimeout(function(): void {
            footnote.classList.remove('weave-footnote-highlight');
          }, 2000);
        }
      }
      return;
    }

    // Handle footnote backref clicks (jump back to reference)
    const fnBackref = target.closest<HTMLAnchorElement>('.weave-footnote-backref');
    if (fnBackref) {
      const href = fnBackref.getAttribute('href');
      if (href && href.startsWith('#fnref-')) {
        event.preventDefault();
        const refElement = document.querySelector<HTMLElement>(href);
        if (refElement) {
          refElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          refElement.classList.add('weave-footnote-highlight');
          setTimeout(function(): void {
            refElement.classList.remove('weave-footnote-highlight');
          }, 2000);
        }
      }
      return;
    }

    // Close overlays and panels when clicking outside
    if (!target.closest('.weave-overlay') && !target.closest('.weave-panel-content')) {
      closeAllOverlays();
      closeAllPanels();
    }
  }

  /**
   * Event delegation handler for keyboard events
   */
  function handleKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;

    // Handle Enter/Space on sidenote anchors
    if (event.key === 'Enter' || event.key === ' ') {
      const sidenoteAnchor = target.closest<HTMLElement>('.weave-sidenote-anchor');
      if (sidenoteAnchor) {
        event.preventDefault();
        handleSidenoteClick(sidenoteAnchor);
        return;
      }

      // Handle Enter/Space on margin note anchors
      const marginNoteAnchor = target.closest<HTMLElement>('.weave-margin-note-anchor');
      if (marginNoteAnchor) {
        event.preventDefault();
        handleMarginNoteClick(marginNoteAnchor);
        return;
      }

      // Handle Enter/Space on triggers
      const inlineTrigger = target.closest<HTMLElement>('.weave-inline-trigger');
      if (inlineTrigger) {
        event.preventDefault();
        handleInlineTrigger(inlineTrigger);
        return;
      }

      // Handle Enter/Space on stretch triggers
      const stretchTrigger = target.closest<HTMLElement>('.weave-stretch-trigger');
      if (stretchTrigger) {
        event.preventDefault();
        handleStretchTrigger(stretchTrigger);
        return;
      }

      // Handle Enter/Space on stretch anchors
      const stretchAnchor = target.closest<HTMLElement>('.weave-stretch-anchor');
      if (stretchAnchor) {
        event.preventDefault();
        handleStretchAnchor(stretchAnchor);
        return;
      }

      const overlayTrigger = target.closest<HTMLElement>('.weave-node-link[data-display="overlay"]');
      if (overlayTrigger) {
        event.preventDefault();
        const expansion = overlayTrigger.closest('.weave-overlay');
        const content = expansion ? expansion.querySelector<HTMLElement>('.weave-overlay-content') : null;
        const isVisible = content && content.classList.contains('active');
        
        closeAllOverlays();
        
        if (!isVisible) {
          handleOverlay(overlayTrigger, true);
        }
        return;
      }

      const panelTrigger = target.closest<HTMLElement>('.weave-panel-trigger, .weave-panel-anchor');
      if (panelTrigger) {
        event.preventDefault();
        handlePanel(panelTrigger);
        return;
      }
    }

    // Handle Escape to close overlays and panels
    if (event.key === 'Escape') {
      closeAllOverlays();
      closeAllPanels();
    }
  }

  // Set up event delegation on document
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeydown, true);

  // Handle window resize - reposition overlays and update sidenote mode
  window.addEventListener('resize', function(): void {
    // Reposition overlays
    document.querySelectorAll<HTMLElement>('.weave-overlay').forEach(function(expansion): void {
      const content = expansion.querySelector<HTMLElement>('.weave-overlay-content.active');
      const trigger = expansion.querySelector<HTMLElement>('.weave-node-link');
      if (content && trigger) {
        positionOverlay(trigger, content);
      }
    });
    
    // Update sidenote display mode
    updateSidenoteMode();
  });

  // Initial sidenote mode setup
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateSidenoteMode);
  } else {
    updateSidenoteMode();
  }

})();
