/* eslint-disable */
// fill-helper.js
// This script is injected into the page to handle form filling operations

if (window.__FILL_HELPER_INITIALIZED__) {
  // Already initialized, skip
} else {
  window.__FILL_HELPER_INITIALIZED__ = true;
  /**
   * Fill an input element with the specified value
   * @param {string} selector - CSS selector for the element to fill
   * @param {string|null} ref - Snapshot ref for the element to fill
   * @param {string} value - Value to fill into the element
   * @returns {Promise<Object>} - Result of the fill operation
   */
  async function fillElement(selector, ref, value) {
    try {
      // Find the element
      const element = ref
        ? (window.__mcpChromeSnapshotRefs || {})[ref] || null
        : document.querySelector(selector);
      if (!element) {
        return {
          error: ref
            ? `Snapshot ref "${ref}" not found. Call chrome_page_snapshot first.`
            : `Element with selector "${selector}" not found`,
        };
      }

      // Get element information
      const rect = element.getBoundingClientRect();
      const elementInfo = {
        tagName: element.tagName,
        id: element.id,
        className: element.className,
        type: element.type || null,
        isVisible: isElementVisible(element),
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        },
      };

      // Check if element is visible
      if (!elementInfo.isVisible) {
        return {
          error: `Element with selector "${selector}" is not visible`,
          elementInfo,
        };
      }

      // Check if element is an input, textarea, or select
      const validTags = ['INPUT', 'TEXTAREA', 'SELECT'];
      const validInputTypes = [
        'text',
        'email',
        'password',
        'number',
        'search',
        'tel',
        'url',
        'date',
        'datetime-local',
        'month',
        'time',
        'week',
        'color',
      ];

      if (!validTags.includes(element.tagName)) {
        return {
          error: `Element with selector "${selector}" is not a fillable element (must be INPUT, TEXTAREA, or SELECT)`,
          elementInfo,
        };
      }

      // For input elements, check if the type is valid
      if (
        element.tagName === 'INPUT' &&
        !validInputTypes.includes(element.type) &&
        element.type !== null
      ) {
        return {
          error: `Input element with selector "${selector}" has type "${element.type}" which is not fillable`,
          elementInfo,
        };
      }

      // Scroll element into view
      element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Focus the element
      element.focus();

      // Fill the element based on its type
      if (element.tagName === 'SELECT') {
        // For select elements, find the option with matching value or text
        let optionFound = false;
        for (const option of element.options) {
          if (option.value === value || option.text === value) {
            element.value = option.value;
            optionFound = true;
            break;
          }
        }

        if (!optionFound) {
          return {
            error: `No option with value or text "${value}" found in select element`,
            elementInfo,
          };
        }

        // Trigger change event
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // For input and textarea elements

        // Clear the current value
        element.value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));

        // Set the new value
        element.value = value;

        // Trigger input and change events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Blur the element
      element.blur();

      return {
        success: true,
        message: 'Element filled successfully',
        elementInfo: {
          ...elementInfo,
          value: element.value, // Include the final value in the response
        },
      };
    } catch (error) {
      return {
        error: `Error filling element: ${error.message}`,
      };
    }
  }

  /**
   * Check if an element is visible
   * @param {Element} element - The element to check
   * @returns {boolean} - Whether the element is visible
   */
  function isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    // Check if element is within viewport
    if (
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth
    ) {
      return false;
    }

    // Check if element is actually visible at its center point
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const elementAtPoint = document.elementFromPoint(centerX, centerY);
    if (!elementAtPoint) return false;

    return element === elementAtPoint || element.contains(elementAtPoint);
  }

  // Listen for messages from the extension
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'fillElement') {
      fillElement(request.selector, request.ref, request.value)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            error: `Unexpected error: ${error.message}`,
          });
        });
      return true; // Indicates async response
    } else if (request.action === 'chrome_fill_or_select_ping') {
      sendResponse({ status: 'pong' });
      return false;
    }
  });
}
