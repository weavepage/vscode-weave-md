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
   * Handles expand/collapse toggle for inline and stretch display modes
   */
  function handleToggle(toggle) {
    const expansion = toggle.closest('.weave-expansion');
    if (!expansion) return;

    const body = expansion.querySelector('.weave-body');
    if (!body) return;

    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
    const icon = toggle.querySelector('.weave-toggle-icon');

    if (isExpanded) {
      body.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (icon) icon.textContent = '▶';
    } else {
      body.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      if (icon) icon.textContent = '▼';
    }
  }

  /**
   * Handles overlay popover show/hide
   */
  function handleOverlay(trigger, show) {
    const expansion = trigger.closest('.weave-overlay');
    if (!expansion) return;

    const popover = expansion.querySelector('.weave-popover');
    if (!popover) return;

    if (show) {
      popover.hidden = false;
      positionPopover(trigger, popover);
    } else {
      popover.hidden = true;
    }
  }

  /**
   * Positions a popover relative to its trigger
   */
  function positionPopover(trigger, popover) {
    const triggerRect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Reset positioning
    popover.style.left = '';
    popover.style.right = '';
    popover.style.top = '';
    popover.style.bottom = '';

    // Get popover dimensions after making visible
    const popoverRect = popover.getBoundingClientRect();

    // Position below trigger by default
    let top = triggerRect.bottom + 4;
    let left = triggerRect.left;

    // Adjust if would overflow right
    if (left + popoverRect.width > viewportWidth - 16) {
      left = Math.max(16, viewportWidth - popoverRect.width - 16);
    }

    // Adjust if would overflow bottom - show above instead
    if (top + popoverRect.height > viewportHeight - 16) {
      top = Math.max(16, triggerRect.top - popoverRect.height - 4);
    }

    popover.style.position = 'fixed';
    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
  }

  /**
   * Closes all open popovers
   */
  function closeAllPopovers() {
    document.querySelectorAll('.weave-popover:not([hidden])').forEach(function(popover) {
      popover.hidden = true;
    });
  }

  /**
   * Event delegation handler for clicks
   */
  function handleClick(event) {
    const target = event.target;

    // Handle toggle clicks (inline/stretch)
    const toggle = target.closest('.weave-toggle');
    if (toggle) {
      event.preventDefault();
      handleToggle(toggle);
      return;
    }

    // Handle overlay trigger clicks
    const overlayTrigger = target.closest('.weave-trigger');
    if (overlayTrigger) {
      event.preventDefault();
      event.stopPropagation();
      const expansion = overlayTrigger.closest('.weave-overlay');
      const popover = expansion ? expansion.querySelector('.weave-popover') : null;
      const isVisible = popover && !popover.hidden;
      
      closeAllPopovers();
      
      if (!isVisible) {
        handleOverlay(overlayTrigger, true);
      }
      return;
    }

    // Handle footnote link clicks
    const fnLink = target.closest('.weave-fn-link');
    if (fnLink) {
      const href = fnLink.getAttribute('href');
      if (href && href.startsWith('#weave-fn-')) {
        event.preventDefault();
        const fnBody = document.querySelector(href);
        if (fnBody) {
          fnBody.hidden = !fnBody.hidden;
          if (!fnBody.hidden) {
            fnBody.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      }
      return;
    }

    // Handle footnote back link clicks
    const fnBack = target.closest('.weave-fn-back');
    if (fnBack) {
      const href = fnBack.getAttribute('href');
      if (href) {
        event.preventDefault();
        const fnRef = document.querySelector(href);
        if (fnRef) {
          fnRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // Hide the footnote body
        const fnBody = fnBack.closest('.weave-fn-body');
        if (fnBody) {
          fnBody.hidden = true;
        }
      }
      return;
    }

    // Close popovers when clicking outside
    if (!target.closest('.weave-overlay')) {
      closeAllPopovers();
    }
  }

  /**
   * Event delegation handler for keyboard events
   */
  function handleKeydown(event) {
    const target = event.target;

    // Handle Enter/Space on toggles
    if (event.key === 'Enter' || event.key === ' ') {
      const toggle = target.closest('.weave-toggle');
      if (toggle) {
        event.preventDefault();
        handleToggle(toggle);
        return;
      }

      const overlayTrigger = target.closest('.weave-trigger');
      if (overlayTrigger) {
        event.preventDefault();
        const expansion = overlayTrigger.closest('.weave-overlay');
        const popover = expansion ? expansion.querySelector('.weave-popover') : null;
        const isVisible = popover && !popover.hidden;
        
        closeAllPopovers();
        
        if (!isVisible) {
          handleOverlay(overlayTrigger, true);
        }
        return;
      }
    }

    // Handle Escape to close popovers
    if (event.key === 'Escape') {
      closeAllPopovers();
    }
  }

  /**
   * Event delegation handler for hover (overlay mode)
   */
  function handleMouseEnter(event) {
    const trigger = event.target.closest('.weave-trigger');
    if (trigger) {
      handleOverlay(trigger, true);
    }
  }

  function handleMouseLeave(event) {
    const overlay = event.target.closest('.weave-overlay');
    if (overlay) {
      // Check if we're leaving to the popover
      const relatedTarget = event.relatedTarget;
      if (relatedTarget && overlay.contains(relatedTarget)) {
        return;
      }
      const popover = overlay.querySelector('.weave-popover');
      if (popover) {
        popover.hidden = true;
      }
    }
  }

  // Set up event delegation on document
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeydown, true);

  // Optional: hover behavior for overlays (can be enabled via CSS class)
  document.addEventListener('mouseenter', handleMouseEnter, true);
  document.addEventListener('mouseleave', handleMouseLeave, true);

  // Handle window resize - reposition visible popovers
  window.addEventListener('resize', function() {
    document.querySelectorAll('.weave-overlay').forEach(function(overlay) {
      const popover = overlay.querySelector('.weave-popover:not([hidden])');
      const trigger = overlay.querySelector('.weave-trigger');
      if (popover && trigger) {
        positionPopover(trigger, popover);
      }
    });
  });

})();
