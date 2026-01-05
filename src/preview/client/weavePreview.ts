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
   * Event delegation handler for clicks
   */
  function handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

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

    // Close overlays when clicking outside
    if (!target.closest('.weave-overlay')) {
      closeAllOverlays();
    }
  }

  /**
   * Event delegation handler for keyboard events
   */
  function handleKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;

    // Handle Enter/Space on triggers
    if (event.key === 'Enter' || event.key === ' ') {
      const inlineTrigger = target.closest<HTMLElement>('.weave-inline-trigger');
      if (inlineTrigger) {
        event.preventDefault();
        handleInlineTrigger(inlineTrigger);
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
    }

    // Handle Escape to close overlays
    if (event.key === 'Escape') {
      closeAllOverlays();
    }
  }

  // Set up event delegation on document
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeydown, true);

  // Handle window resize - reposition visible overlays
  window.addEventListener('resize', function(): void {
    document.querySelectorAll<HTMLElement>('.weave-overlay').forEach(function(expansion): void {
      const content = expansion.querySelector<HTMLElement>('.weave-overlay-content.active');
      const trigger = expansion.querySelector<HTMLElement>('.weave-node-link');
      if (content && trigger) {
        positionOverlay(trigger, content);
      }
    });
  });

})();
