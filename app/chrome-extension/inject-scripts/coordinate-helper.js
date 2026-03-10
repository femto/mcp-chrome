/* eslint-disable */
/**
 * Coordinate Helper - Shows mouse coordinates in a floating display
 * Injected by content script when debug coordinate mode is enabled
 */
(function () {
  const DISPLAY_ID = '__mcp_chrome_coordinate_display__';

  // Check if already injected
  if (document.getElementById(DISPLAY_ID)) {
    return;
  }

  // Create the coordinate display element
  const display = document.createElement('div');
  display.id = DISPLAY_ID;
  display.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    background: rgba(0, 0, 0, 0.8);
    color: #00ff00;
    font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
    font-size: 12px;
    padding: 6px 10px;
    border-radius: 4px;
    pointer-events: none;
    user-select: none;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(0, 255, 0, 0.3);
    display: none;
  `;

  document.body.appendChild(display);

  // Track mouse position
  let lastX = 0;
  let lastY = 0;

  function updateDisplay(e) {
    // CSS coordinates (what we use for clicking)
    const cssX = e.clientX;
    const cssY = e.clientY;

    // Page coordinates (includes scroll)
    const pageX = e.pageX;
    const pageY = e.pageY;

    // Device pixel ratio
    const dpr = window.devicePixelRatio || 1;

    lastX = cssX;
    lastY = cssY;

    // Update content
    display.innerHTML = `
      <div style="margin-bottom: 2px;"><b>CSS:</b> x: ${cssX}, y: ${cssY}</div>
      <div style="margin-bottom: 2px;"><b>Page:</b> x: ${pageX}, y: ${pageY}</div>
      <div style="color: #888; font-size: 10px;">DPR: ${dpr}</div>
    `;

    // Position the display near the cursor (offset to avoid covering the cursor)
    const offsetX = 15;
    const offsetY = 15;

    let displayX = cssX + offsetX;
    let displayY = cssY + offsetY;

    // Keep display within viewport
    const displayRect = display.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (displayX + displayRect.width > viewportWidth) {
      displayX = cssX - displayRect.width - offsetX;
    }
    if (displayY + displayRect.height > viewportHeight) {
      displayY = cssY - displayRect.height - offsetY;
    }

    display.style.left = displayX + 'px';
    display.style.top = displayY + 'px';
    display.style.display = 'block';
  }

  function hideDisplay() {
    display.style.display = 'none';
  }

  // Event listeners
  document.addEventListener('mousemove', updateDisplay, { passive: true });
  document.addEventListener('mouseleave', hideDisplay, { passive: true });

  // Store cleanup function for removal
  window.__mcpChromeCoordinateHelperCleanup = function () {
    document.removeEventListener('mousemove', updateDisplay);
    document.removeEventListener('mouseleave', hideDisplay);
    if (display.parentNode) {
      display.parentNode.removeChild(display);
    }
    delete window.__mcpChromeCoordinateHelperCleanup;
  };

  // Listen for cleanup message
  window.addEventListener('message', function handler(event) {
    if (event.data && event.data.type === '__MCP_CHROME_COORDINATE_HELPER_CLEANUP__') {
      if (window.__mcpChromeCoordinateHelperCleanup) {
        window.__mcpChromeCoordinateHelperCleanup();
      }
      window.removeEventListener('message', handler);
    }
  });
})();
