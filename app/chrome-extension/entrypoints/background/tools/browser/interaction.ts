import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'mcp-chrome-shared';
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';
import { TIMEOUTS, ERROR_MESSAGES } from '@/common/constants';
import { getLastScreenshotContext } from './screenshot-context';

interface Coordinates {
  x: number;
  y: number;
}

interface ClickToolParams {
  selector?: string; // CSS selector for the element to click
  coordinates?: Coordinates; // Coordinates to click at (x, y relative to viewport)
  fromScreenshot?: boolean; // If true, coordinates are from the last screenshot and need conversion
  waitForNavigation?: boolean; // Whether to wait for navigation to complete after click
  timeout?: number; // Timeout in milliseconds for waiting for the element or navigation
}

/**
 * Tool for clicking elements on web pages
 */
class ClickTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.CLICK;

  /**
   * Execute click operation
   */
  async execute(args: ClickToolParams): Promise<ToolResult> {
    const {
      selector,
      coordinates,
      fromScreenshot = false,
      waitForNavigation = false,
      timeout = TIMEOUTS.DEFAULT_WAIT * 5,
    } = args;

    console.log(`Starting click operation with options:`, args);

    if (!selector && !coordinates) {
      return createErrorResponse(
        ERROR_MESSAGES.INVALID_PARAMETERS + ': Either selector or coordinates must be provided',
      );
    }

    try {
      // Get current tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        return createErrorResponse(ERROR_MESSAGES.TAB_NOT_FOUND);
      }

      const tab = tabs[0];
      if (!tab.id) {
        return createErrorResponse(ERROR_MESSAGES.TAB_NOT_FOUND + ': Active tab has no ID');
      }

      await this.injectContentScript(tab.id, ['inject-scripts/click-helper.js']);

      let resolvedCoordinates = coordinates;
      let adjustedFromScreenshot = false;
      if (coordinates) {
        const adjusted = adjustCoordinatesFromScreenshot(tab.id, coordinates, fromScreenshot);
        if (adjusted) {
          resolvedCoordinates = adjusted.coords;
          adjustedFromScreenshot = adjusted.adjusted;
        }
      }

      // Send click message to content script
      const result = await this.sendMessageToTab(tab.id, {
        action: TOOL_MESSAGE_TYPES.CLICK_ELEMENT,
        selector,
        coordinates: resolvedCoordinates,
        waitForNavigation,
        timeout,
      });

      // Build readable response
      const parts: string[] = [];
      parts.push(result.message || 'Click operation successful');

      if (coordinates) {
        const coordText = resolvedCoordinates
          ? `Clicked at coordinates (${resolvedCoordinates.x}, ${resolvedCoordinates.y})`
          : `Clicked at coordinates (${coordinates.x}, ${coordinates.y})`;
        parts.push(coordText);
        if (adjustedFromScreenshot) {
          parts.push('Coordinates were converted from the last screenshot');
        }
      } else if (selector) {
        parts.push(`Clicked element: ${selector}`);
      }

      if (result.elementInfo) {
        if (result.elementInfo.tagName)
          parts.push(`Element: <${result.elementInfo.tagName.toLowerCase()}>`);
        if (result.elementInfo.text) parts.push(`Text: "${result.elementInfo.text}"`);
      }

      if (result.navigationOccurred) {
        parts.push('Navigation occurred after click');
      }

      return {
        content: [
          {
            type: 'text',
            text: parts.join('\n'),
          },
        ],
        isError: false,
      };
    } catch (error) {
      console.error('Error in click operation:', error);
      return createErrorResponse(
        `Error performing click: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

const SCREENSHOT_COORD_MAX_AGE_MS = 2 * 60 * 1000;

type AdjustedCoords = { coords: Coordinates; adjusted: boolean };

/**
 * Convert screenshot-space coordinates to viewport coordinates when possible.
 */
function adjustCoordinatesFromScreenshot(
  tabId: number,
  coords: Coordinates,
  force: boolean,
): AdjustedCoords | null {
  const ctx = getLastScreenshotContext(tabId);
  if (!ctx) return null;

  if (Date.now() - ctx.timestamp > SCREENSHOT_COORD_MAX_AGE_MS) {
    return null;
  }

  // Only auto-adjust for viewport screenshots; element/fullPage require explicit opt-in.
  if (!force && ctx.scope !== 'viewport') return null;

  const withinScaled =
    coords.x >= 0 && coords.y >= 0 && coords.x <= ctx.scaledWidth && coords.y <= ctx.scaledHeight;

  if (!force && !withinScaled) return null;

  let xCss = coords.x / (ctx.scaleX || 1);
  let yCss = coords.y / (ctx.scaleY || 1);

  if (ctx.scope === 'element' && ctx.elementRect) {
    const scrollAtCaptureX = ctx.elementScrollX || 0;
    const scrollAtCaptureY = ctx.elementScrollY || 0;
    xCss = ctx.elementRect.x + scrollAtCaptureX + xCss - (ctx.scrollX || 0);
    yCss = ctx.elementRect.y + scrollAtCaptureY + yCss - (ctx.scrollY || 0);
  } else if (ctx.scope === 'fullPage') {
    xCss = xCss - (ctx.scrollX || 0);
    yCss = yCss - (ctx.scrollY || 0);
  }

  return {
    coords: { x: Math.round(xCss), y: Math.round(yCss) },
    adjusted: true,
  };
}

export const clickTool = new ClickTool();

interface FillToolParams {
  selector: string;
  value: string;
  useCDP?: boolean; // Use Chrome DevTools Protocol for trusted input (bypasses CSP)
  pierceShadow?: boolean; // Pierce through Shadow DOM (including closed shadow roots)
}

/**
 * Tool for filling form elements on web pages
 */
class FillTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.FILL;

  /**
   * Execute fill operation
   */
  async execute(args: FillToolParams): Promise<ToolResult> {
    const { selector, value, useCDP = false, pierceShadow = false } = args;

    console.log(`Starting fill operation with options:`, args);

    if (!selector) {
      return createErrorResponse(ERROR_MESSAGES.INVALID_PARAMETERS + ': Selector must be provided');
    }

    if (value === undefined || value === null) {
      return createErrorResponse(ERROR_MESSAGES.INVALID_PARAMETERS + ': Value must be provided');
    }

    try {
      // Get current tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        return createErrorResponse(ERROR_MESSAGES.TAB_NOT_FOUND);
      }

      const tab = tabs[0];
      if (!tab.id) {
        return createErrorResponse(ERROR_MESSAGES.TAB_NOT_FOUND + ': Active tab has no ID');
      }

      // Pierce Shadow DOM requires CDP
      if (pierceShadow) {
        return await this.fillWithCDPPiercingShadow(tab.id, selector, value);
      }

      // Use CDP for trusted input (bypasses CSP, works with complex editors like Lexical)
      if (useCDP) {
        return await this.fillWithCDP(tab.id, selector, value);
      }

      await this.injectContentScript(tab.id, ['inject-scripts/fill-helper.js']);

      // Send fill message to content script
      const result = await this.sendMessageToTab(tab.id, {
        action: TOOL_MESSAGE_TYPES.FILL_ELEMENT,
        selector,
        value,
      });

      if (result.error) {
        return createErrorResponse(result.error);
      }

      // Build readable response
      const parts: string[] = [];
      parts.push(result.message || 'Fill operation successful');
      parts.push(`Filled element: ${selector}`);
      parts.push(`Value: "${value}"`);

      if (result.elementInfo) {
        if (result.elementInfo.tagName)
          parts.push(`Element: <${result.elementInfo.tagName.toLowerCase()}>`);
      }

      return {
        content: [
          {
            type: 'text',
            text: parts.join('\n'),
          },
        ],
        isError: false,
      };
    } catch (error) {
      console.error('Error in fill operation:', error);
      return createErrorResponse(
        `Error filling element: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Fill element using Chrome DevTools Protocol (CDP)
   * This bypasses CSP and sends trusted input events
   */
  private async fillWithCDP(tabId: number, selector: string, value: string): Promise<ToolResult> {
    const DEBUGGER_VERSION = '1.3';

    try {
      // Check if debugger is already attached
      const targets = await chrome.debugger.getTargets();
      const existingTarget = targets.find(
        (t) => t.tabId === tabId && t.attached && t.type === 'page',
      );

      if (existingTarget && !existingTarget.extensionId) {
        return createErrorResponse(
          'Debugger is already attached to this tab (possibly by DevTools). Please close DevTools and try again.',
        );
      }

      // Attach debugger
      await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION);

      try {
        // Focus the element using Runtime.evaluate (bypasses CSP)
        const focusResult = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
          expression: `
            (function() {
              const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
              if (!element) {
                return { success: false, error: 'Element not found: ${selector.replace(/'/g, "\\'")}' };
              }

              // Click to activate (for complex editors)
              element.click();

              // Focus the element
              element.focus();

              // For contenteditable elements, select all content so insertText replaces it
              if (element.contentEditable === 'true' || element.getAttribute('role') === 'textbox') {
                // Select all content (insertText will replace selection)
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(element);
                sel.removeAllRanges();
                sel.addRange(range);
              } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                // For regular inputs, select all to replace
                element.select();
              }

              return {
                success: true,
                tagName: element.tagName,
                isContentEditable: element.contentEditable === 'true'
              };
            })()
          `,
          returnByValue: true,
        });

        const focusData = (focusResult as any)?.result?.value;
        if (!focusData?.success) {
          throw new Error(focusData?.error || 'Failed to focus element');
        }

        // Longer delay to ensure focus is fully established (complex editors need time)
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Always use Ctrl+A to select all via CDP keyboard (works for custom elements too)
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'a',
          code: 'KeyA',
          modifiers: 2, // Ctrl/Cmd
        });
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: 'a',
          code: 'KeyA',
          modifiers: 2,
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Strategy 1: Try Input.insertText first (fast, one-shot, more natural)
        await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', {
          text: value,
        });

        // Small delay to let the editor process the input
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify if the text was actually inserted
        const verifyResult = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
          expression: `
            (function() {
              const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
              if (!element) return { content: '', found: false };

              // Get the actual content
              let content = '';
              if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                content = element.value || '';
              } else {
                content = element.textContent || element.innerText || '';
              }

              return { content: content.trim(), found: true };
            })()
          `,
          returnByValue: true,
        });

        const verifyData = (verifyResult as any)?.result?.value;
        const insertedContent = verifyData?.content || '';

        // Check if insertText worked (content should contain our value)
        // For custom elements (not INPUT/TEXTAREA), we can't reliably read shadow DOM content,
        // so we assume insertText worked if we can't verify
        const isStandardInput = ['INPUT', 'TEXTAREA'].includes(focusData.tagName);
        const insertTextWorked =
          insertedContent.includes(value) ||
          insertedContent.length >= value.length * 0.8 ||
          (!isStandardInput && insertedContent === ''); // Custom element - can't read shadow DOM, assume success

        // Strategy 2: Fall back to character-by-character if insertText didn't work
        if (!insertTextWorked && verifyData?.found && isStandardInput) {
          console.log('insertText failed, falling back to character-by-character input');

          // Helper for random delay (mimics human typing variance)
          const randomDelay = (min: number, max: number) =>
            new Promise((resolve) =>
              setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min),
            );

          // Clear and refocus
          await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
            expression: `
              (function() {
                const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
                if (element) {
                  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    element.value = '';
                    element.select();
                  } else {
                    element.innerHTML = '';
                  }
                  element.focus();
                }
              })()
            `,
          });

          await randomDelay(30, 80);

          // Type each character using Input.dispatchKeyEvent
          for (const char of value) {
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
              type: 'keyDown',
              key: char,
            });

            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
              type: 'char',
              text: char,
            });

            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
              type: 'keyUp',
              key: char,
            });

            // Human-like typing delays: longer pause after space/punctuation (finishing a word)
            if (' .,!?;:\n'.includes(char)) {
              await randomDelay(80, 200);
            } else {
              await randomDelay(5, 25);
            }
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: [
                'Fill operation successful (CDP mode)',
                `Filled element: ${selector}`,
                `Value: "${value}"`,
                `Element: <${focusData.tagName?.toLowerCase() || 'unknown'}>`,
                focusData.isContentEditable ? '(contenteditable element)' : '',
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
          isError: false,
        };
      } finally {
        // Always detach debugger
        try {
          await chrome.debugger.detach({ tabId });
        } catch (e) {
          console.warn('Error detaching debugger:', e);
        }
      }
    } catch (error) {
      console.error('Error in CDP fill operation:', error);
      return createErrorResponse(
        `Error filling element (CDP): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Fill element using CDP with Shadow DOM piercing
   * This can find elements inside closed shadow roots (like Reddit's custom components)
   */
  private async fillWithCDPPiercingShadow(
    tabId: number,
    selector: string,
    value: string,
  ): Promise<ToolResult> {
    const DEBUGGER_VERSION = '1.3';

    try {
      // Check if debugger is already attached
      const targets = await chrome.debugger.getTargets();
      const existingTarget = targets.find(
        (t) => t.tabId === tabId && t.attached && t.type === 'page',
      );

      if (existingTarget && !existingTarget.extensionId) {
        return createErrorResponse(
          'Debugger is already attached to this tab (possibly by DevTools). Please close DevTools and try again.',
        );
      }

      // Attach debugger
      await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION);

      try {
        // Enable DOM domain for shadow DOM piercing
        await chrome.debugger.sendCommand({ tabId }, 'DOM.enable');

        // Get document with shadow DOM piercing enabled
        await chrome.debugger.sendCommand({ tabId }, 'DOM.getDocument', {
          pierce: true,
          depth: -1, // Get entire tree including shadow roots
        });

        // Try to find the element using DOM.performSearch (works across shadow roots)
        let nodeId: number | undefined;
        let nodeName = 'unknown';

        // First try DOM.performSearch with CSS selector
        try {
          const searchResult = (await chrome.debugger.sendCommand({ tabId }, 'DOM.performSearch', {
            query: selector,
            includeUserAgentShadowDOM: true,
          })) as { searchId: string; resultCount: number };

          if (searchResult.resultCount > 0) {
            const nodeResults = (await chrome.debugger.sendCommand(
              { tabId },
              'DOM.getSearchResults',
              {
                searchId: searchResult.searchId,
                fromIndex: 0,
                toIndex: 1,
              },
            )) as { nodeIds: number[] };

            nodeId = nodeResults.nodeIds[0];

            // Clean up search
            await chrome.debugger.sendCommand({ tabId }, 'DOM.discardSearchResults', {
              searchId: searchResult.searchId,
            });

            // Get node info
            const nodeInfo = (await chrome.debugger.sendCommand({ tabId }, 'DOM.describeNode', {
              nodeId,
            })) as { node: { nodeName: string; localName?: string } };
            nodeName = nodeInfo.node.localName || nodeInfo.node.nodeName;
          }
        } catch (searchError) {
          console.log('DOM.performSearch failed, falling back to recursive search:', searchError);
        }

        // Fallback: recursively search through shadow roots using Runtime.evaluate
        if (!nodeId) {
          const findResult = (await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
            expression: `
              (function() {
                // Recursive function to find element in shadow DOMs
                function querySelectorDeep(selector, root = document) {
                  // Try in current root
                  let el = root.querySelector(selector);
                  if (el) return el;

                  // Search in all shadow roots (including closed ones via TreeWalker)
                  const walker = document.createTreeWalker(
                    root === document ? document.documentElement : root,
                    NodeFilter.SHOW_ELEMENT
                  );

                  let node;
                  while (node = walker.nextNode()) {
                    // Try to access shadow root (works for open, not closed)
                    if (node.shadowRoot) {
                      el = querySelectorDeep(selector, node.shadowRoot);
                      if (el) return el;
                    }
                  }

                  return null;
                }

                const element = querySelectorDeep('${selector.replace(/'/g, "\\'")}');
                if (!element) {
                  return { found: false, error: 'Element not found' };
                }

                // Get element position for clicking
                const rect = element.getBoundingClientRect();
                return {
                  found: true,
                  tagName: element.tagName,
                  x: rect.x + rect.width / 2,
                  y: rect.y + rect.height / 2
                };
              })()
            `,
            returnByValue: true,
          })) as {
            result: {
              value: { found: boolean; error?: string; tagName?: string; x?: number; y?: number };
            };
          };

          const findData = findResult.result?.value;

          if (!findData?.found) {
            // Last resort: use CDP to find by traversing DOM nodes
            const flattenedDoc = (await chrome.debugger.sendCommand(
              { tabId },
              'DOM.getFlattenedDocument',
              {
                pierce: true,
                depth: -1,
              },
            )) as { nodes: Array<{ nodeId: number; nodeName: string; attributes?: string[] }> };

            // Parse selector to find matching node (simple attribute selector support)
            const attrMatch = selector.match(/\[([^\]=]+)(?:=["']?([^"'\]]+)["']?)?\]/);
            if (attrMatch) {
              const attrName = attrMatch[1];
              const attrValue = attrMatch[2];

              for (const node of flattenedDoc.nodes) {
                if (node.attributes) {
                  for (let i = 0; i < node.attributes.length; i += 2) {
                    if (node.attributes[i] === attrName) {
                      if (!attrValue || node.attributes[i + 1] === attrValue) {
                        nodeId = node.nodeId;
                        nodeName = node.nodeName;
                        break;
                      }
                    }
                  }
                }
                if (nodeId) break;
              }
            }

            // Try matching by tag name
            if (!nodeId) {
              const tagMatch = selector.match(/^([a-zA-Z][\w-]*)/);
              if (tagMatch) {
                const tagName = tagMatch[1].toUpperCase();
                for (const node of flattenedDoc.nodes) {
                  if (node.nodeName === tagName) {
                    nodeId = node.nodeId;
                    nodeName = node.nodeName;
                    break;
                  }
                }
              }
            }

            if (!nodeId) {
              throw new Error(`Element not found with selector: ${selector}`);
            }
          } else if (findData.x !== undefined && findData.y !== undefined) {
            // Element found via JS, use click coordinates
            nodeName = findData.tagName || 'unknown';

            // Click at element center to focus
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
              type: 'mousePressed',
              x: findData.x,
              y: findData.y,
              button: 'left',
              clickCount: 1,
            });
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
              type: 'mouseReleased',
              x: findData.x,
              y: findData.y,
              button: 'left',
              clickCount: 1,
            });

            // Wait for focus
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Select all and insert text
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
              type: 'keyDown',
              key: 'a',
              code: 'KeyA',
              modifiers: 2, // Ctrl/Cmd
            });
            await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
              type: 'keyUp',
              key: 'a',
              code: 'KeyA',
              modifiers: 2,
            });
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Insert the text
            await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', {
              text: value,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: [
                    'Fill operation successful (CDP Shadow DOM piercing mode)',
                    `Filled element: ${selector}`,
                    `Value: "${value}"`,
                    `Element: <${nodeName.toLowerCase()}>`,
                  ].join('\n'),
                },
              ],
              isError: false,
            };
          }
        }

        // If we found nodeId via DOM API, focus and type
        if (nodeId) {
          // Focus the node using DOM.focus
          await chrome.debugger.sendCommand({ tabId }, 'DOM.focus', { nodeId });

          // Wait for focus
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Select all (Ctrl+A)
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'a',
            code: 'KeyA',
            modifiers: 2, // Ctrl/Cmd
          });
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'a',
            code: 'KeyA',
            modifiers: 2,
          });
          await new Promise((resolve) => setTimeout(resolve, 50));

          // Insert the text
          await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', {
            text: value,
          });

          return {
            content: [
              {
                type: 'text',
                text: [
                  'Fill operation successful (CDP Shadow DOM piercing mode)',
                  `Filled element: ${selector}`,
                  `Value: "${value}"`,
                  `Element: <${nodeName.toLowerCase()}>`,
                ].join('\n'),
              },
            ],
            isError: false,
          };
        }

        throw new Error(`Element not found with selector: ${selector}`);
      } finally {
        // Always disable DOM and detach debugger
        try {
          await chrome.debugger.sendCommand({ tabId }, 'DOM.disable');
        } catch (e) {
          console.warn('Error disabling DOM:', e);
        }
        try {
          await chrome.debugger.detach({ tabId });
        } catch (e) {
          console.warn('Error detaching debugger:', e);
        }
      }
    } catch (error) {
      console.error('Error in CDP Shadow DOM fill operation:', error);
      return createErrorResponse(
        `Error filling element (CDP Shadow DOM): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const fillTool = new FillTool();
