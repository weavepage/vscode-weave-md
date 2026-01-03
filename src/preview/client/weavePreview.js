/**
 * Weave Preview Client Script
 * 
 * Constraints (from plan):
 * - Scripts must be idempotent and use event delegation
 * - Scripts must only interact with DOM elements created by Weave (e.g. .weave-*)
 * - Must not mutate or reparent nodes created by other renderers
 * - No runtime fetch/RPC - scripts only manipulate DOM
 */

(function() {
  'use strict';

  // Idempotency check - only initialize once
  if (window.__weavePreviewInitialized) {
    return;
  }
  window.__weavePreviewInitialized = true;

  /**
   * Handles expand/collapse for inline triggers (text links)
   */
  function handleInlineTrigger(trigger) {
    const expansion = trigger.closest('.weave-expansion');
    if (!expansion) return;

    const content = expansion.querySelector('.weave-inline-content');
    if (!content) return;

    const isExpanded = trigger.classList.contains('expanded');

    if (isExpanded) {
      content.style.display = 'none';
      trigger.classList.remove('expanded');
      trigger.setAttribute('aria-expanded', 'false');
    } else {
      content.style.display = 'block';
      trigger.classList.add('expanded');
      trigger.setAttribute('aria-expanded', 'true');
    }
  }

  /**
   * Handles expand/collapse for inline anchor icons
   */
  function handleInlineAnchor(anchor) {
    const targetId = anchor.getAttribute('data-target');
    // Find the content element (sibling or by data-for attribute)
    let content = anchor.nextElementSibling;
    if (!content || !content.classList.contains('weave-inline-content')) {
      content = document.querySelector('.weave-inline-content[data-for="' + targetId + '"]');
    }
    if (!content) return;

    const isExpanded = anchor.classList.contains('expanded');

    if (isExpanded) {
      content.style.display = 'none';
      anchor.classList.remove('expanded');
    } else {
      content.style.display = 'block';
      anchor.classList.add('expanded');
    }
  }

  /**
   * Handles overlay show/hide
   */
  function handleOverlay(trigger, show) {
    const expansion = trigger.closest('.weave-overlay');
    if (!expansion) return;

    const content = expansion.querySelector('.weave-overlay-content');
    if (!content) return;

    if (show) {
      content.hidden = false;
      content.classList.add('active');
      positionOverlay(trigger, content);
    } else {
      content.hidden = true;
      content.classList.remove('active');
    }
  }

  /**
   * Positions an overlay relative to its trigger
   */
  function positionOverlay(trigger, overlay) {
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
  function closeAllOverlays() {
    document.querySelectorAll('.weave-overlay-content.active').forEach(function(overlay) {
      overlay.hidden = true;
      overlay.classList.remove('active');
    });
  }

  /**
   * Event delegation handler for clicks
   */
  function handleClick(event) {
    const target = event.target;

    // Handle inline trigger clicks (text links)
    const inlineTrigger = target.closest('.weave-inline-trigger');
    if (inlineTrigger) {
      event.preventDefault();
      handleInlineTrigger(inlineTrigger);
      return;
    }

    // Handle inline anchor clicks (icon-only)
    const inlineAnchor = target.closest('.weave-inline-anchor');
    if (inlineAnchor) {
      event.preventDefault();
      handleInlineAnchor(inlineAnchor);
      return;
    }

    // Handle overlay anchor clicks (icon-only)
    const overlayAnchor = target.closest('.weave-overlay-anchor');
    if (overlayAnchor) {
      event.preventDefault();
      event.stopPropagation();
      const expansion = overlayAnchor.closest('.weave-overlay');
      const content = expansion ? expansion.querySelector('.weave-overlay-content') : null;
      const isVisible = content && content.classList.contains('active');
      
      closeAllOverlays();
      
      if (!isVisible) {
        handleOverlay(overlayAnchor, true);
      }
      return;
    }

    // Handle overlay trigger clicks (node-link with overlay display)
    const overlayTrigger = target.closest('.weave-node-link[data-display="overlay"]');
    if (overlayTrigger) {
      event.preventDefault();
      event.stopPropagation();
      const expansion = overlayTrigger.closest('.weave-overlay');
      const content = expansion ? expansion.querySelector('.weave-overlay-content') : null;
      const isVisible = content && content.classList.contains('active');
      
      closeAllOverlays();
      
      if (!isVisible) {
        handleOverlay(overlayTrigger, true);
      }
      return;
    }

    // Handle footnote reference clicks (jump to footnote at bottom)
    const fnRefLink = target.closest('.weave-footnote-link, .weave-footnote-ref a');
    if (fnRefLink) {
      const href = fnRefLink.getAttribute('href');
      if (href && href.startsWith('#fn-')) {
        event.preventDefault();
        const footnote = document.querySelector(href);
        if (footnote) {
          footnote.scrollIntoView({ behavior: 'smooth', block: 'center' });
          footnote.classList.add('weave-footnote-highlight');
          setTimeout(function() {
            footnote.classList.remove('weave-footnote-highlight');
          }, 2000);
        }
      }
      return;
    }

    // Handle footnote backref clicks (jump back to reference)
    const fnBackref = target.closest('.weave-footnote-backref');
    if (fnBackref) {
      const href = fnBackref.getAttribute('href');
      if (href && href.startsWith('#fnref-')) {
        event.preventDefault();
        const refElement = document.querySelector(href);
        if (refElement) {
          refElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          refElement.classList.add('weave-footnote-highlight');
          setTimeout(function() {
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
  function handleKeydown(event) {
    const target = event.target;

    // Handle Enter/Space on triggers
    if (event.key === 'Enter' || event.key === ' ') {
      const inlineTrigger = target.closest('.weave-inline-trigger');
      if (inlineTrigger) {
        event.preventDefault();
        handleInlineTrigger(inlineTrigger);
        return;
      }

      const overlayTrigger = target.closest('.weave-node-link[data-display="overlay"]');
      if (overlayTrigger) {
        event.preventDefault();
        const expansion = overlayTrigger.closest('.weave-overlay');
        const content = expansion ? expansion.querySelector('.weave-overlay-content') : null;
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
  window.addEventListener('resize', function() {
    document.querySelectorAll('.weave-overlay').forEach(function(expansion) {
      const content = expansion.querySelector('.weave-overlay-content.active');
      const trigger = expansion.querySelector('.weave-node-link');
      if (content && trigger) {
        positionOverlay(trigger, content);
      }
    });
  });

})();
