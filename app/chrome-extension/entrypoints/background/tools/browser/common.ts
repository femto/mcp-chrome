import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';

// Default window dimensions
const DEFAULT_WINDOW_WIDTH = 1280;
const DEFAULT_WINDOW_HEIGHT = 720;

interface NavigateToolParams {
  url?: string;
  newWindow?: boolean;
  width?: number;
  height?: number;
  refresh?: boolean;
}

/**
 * Tool for navigating to URLs in browser tabs or windows
 */
class NavigateTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.NAVIGATE;

  async execute(args: NavigateToolParams): Promise<ToolResult> {
    const { newWindow = false, width, height, url, refresh = false } = args;

    console.log(
      `Attempting to ${refresh ? 'refresh current tab' : `open URL: ${url}`} with options:`,
      args,
    );

    try {
      // Handle refresh option first
      if (refresh) {
        console.log('Refreshing current active tab');

        // Get current active tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!activeTab || !activeTab.id) {
          return createErrorResponse('No active tab found to refresh');
        }

        // Reload the tab
        await chrome.tabs.reload(activeTab.id);

        console.log(`Refreshed tab ID: ${activeTab.id}`);

        // Get updated tab information
        const updatedTab = await chrome.tabs.get(activeTab.id);

        return {
          content: [
            {
              type: 'text',
              text: `Successfully refreshed current tab\nURL: ${updatedTab.url}`,
            },
          ],
          isError: false,
        };
      }

      // Validate that url is provided when not refreshing
      if (!url) {
        return createErrorResponse('URL parameter is required when refresh is not true');
      }

      // 1. Check if URL is already open
      // Get all tabs and manually compare URLs
      console.log(`Checking if URL is already open: ${url}`);
      // Get all tabs
      const allTabs = await chrome.tabs.query({});
      // Manually filter matching tabs
      const tabs = allTabs.filter((tab) => {
        // Normalize URLs for comparison (remove trailing slashes)
        const tabUrl = tab.url?.endsWith('/') ? tab.url.slice(0, -1) : tab.url;
        const targetUrl = url.endsWith('/') ? url.slice(0, -1) : url;
        return tabUrl === targetUrl;
      });
      console.log(`Found ${tabs.length} matching tabs`);

      if (tabs && tabs.length > 0) {
        const existingTab = tabs[0];
        console.log(
          `URL already open in Tab ID: ${existingTab.id}, Window ID: ${existingTab.windowId}`,
        );

        if (existingTab.id !== undefined) {
          // Activate the tab
          await chrome.tabs.update(existingTab.id, { active: true });

          if (existingTab.windowId !== undefined) {
            // Bring the window containing this tab to the foreground and focus it
            await chrome.windows.update(existingTab.windowId, { focused: true });
          }

          console.log(`Activated existing Tab ID: ${existingTab.id}`);
          // Get updated tab information and return it
          const updatedTab = await chrome.tabs.get(existingTab.id);

          return {
            content: [
              {
                type: 'text',
                text: `Activated existing tab\nURL: ${updatedTab.url}`,
              },
            ],
            isError: false,
          };
        }
      }

      // 2. If URL is not already open, decide how to open it based on options
      const openInNewWindow = newWindow || typeof width === 'number' || typeof height === 'number';

      if (openInNewWindow) {
        console.log('Opening URL in a new window.');

        // Create new window
        const newWindow = await chrome.windows.create({
          url: url,
          width: typeof width === 'number' ? width : DEFAULT_WINDOW_WIDTH,
          height: typeof height === 'number' ? height : DEFAULT_WINDOW_HEIGHT,
          focused: true,
        });

        if (newWindow && newWindow.id !== undefined) {
          console.log(`URL opened in new Window ID: ${newWindow.id}`);

          const tabUrls = newWindow.tabs?.map((tab) => tab.url).join('\n  ') || url;
          return {
            content: [
              {
                type: 'text',
                text: `Opened URL in new window\nWindow ID: ${newWindow.id}\nURL: ${tabUrls}`,
              },
            ],
            isError: false,
          };
        }
      } else {
        console.log('Opening URL in the last active window.');
        // Try to open a new tab in the most recently active window
        const lastFocusedWindow = await chrome.windows.getLastFocused({ populate: false });

        if (lastFocusedWindow && lastFocusedWindow.id !== undefined) {
          console.log(`Found last focused Window ID: ${lastFocusedWindow.id}`);

          const newTab = await chrome.tabs.create({
            url: url,
            windowId: lastFocusedWindow.id,
            active: true,
          });

          // Ensure the window also gets focus
          await chrome.windows.update(lastFocusedWindow.id, { focused: true });

          console.log(
            `URL opened in new Tab ID: ${newTab.id} in existing Window ID: ${lastFocusedWindow.id}`,
          );

          return {
            content: [
              {
                type: 'text',
                text: `Opened URL in new tab\nURL: ${newTab.url}`,
              },
            ],
            isError: false,
          };
        } else {
          // In rare cases, if there's no recently active window (e.g., browser just started with no windows)
          // Fall back to opening in a new window
          console.warn('No last focused window found, falling back to creating a new window.');

          const fallbackWindow = await chrome.windows.create({
            url: url,
            width: DEFAULT_WINDOW_WIDTH,
            height: DEFAULT_WINDOW_HEIGHT,
            focused: true,
          });

          if (fallbackWindow && fallbackWindow.id !== undefined) {
            console.log(`URL opened in fallback new Window ID: ${fallbackWindow.id}`);

            return {
              content: [
                {
                  type: 'text',
                  text: `Opened URL in new window\nURL: ${url}`,
                },
              ],
              isError: false,
            };
          }
        }
      }

      // If all attempts fail, return a generic error
      return createErrorResponse('Failed to open URL: Unknown error occurred');
    } catch (error) {
      if (chrome.runtime.lastError) {
        console.error(`Chrome API Error: ${chrome.runtime.lastError.message}`, error);
        return createErrorResponse(`Chrome API Error: ${chrome.runtime.lastError.message}`);
      } else {
        console.error('Error in navigate:', error);
        return createErrorResponse(
          `Error navigating to URL: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
export const navigateTool = new NavigateTool();

interface CloseTabsToolParams {
  tabIds?: number[];
  url?: string;
}

/**
 * Tool for closing browser tabs
 */
class CloseTabsTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.CLOSE_TABS;

  async execute(args: CloseTabsToolParams): Promise<ToolResult> {
    const { tabIds, url } = args;
    let urlPattern = url;
    console.log(`Attempting to close tabs with options:`, args);

    try {
      // If URL is provided, close all tabs matching that URL
      if (urlPattern) {
        console.log(`Searching for tabs with URL: ${url}`);
        if (!urlPattern.endsWith('/')) {
          urlPattern += '/*';
        }
        const tabs = await chrome.tabs.query({ url });

        if (!tabs || tabs.length === 0) {
          console.log(`No tabs found with URL: ${url}`);
          return {
            content: [
              {
                type: 'text',
                text: `No tabs found with URL: ${url}`,
              },
            ],
            isError: false,
          };
        }

        console.log(`Found ${tabs.length} tabs with URL: ${url}`);
        const tabIdsToClose = tabs
          .map((tab) => tab.id)
          .filter((id): id is number => id !== undefined);

        if (tabIdsToClose.length === 0) {
          return createErrorResponse('Found tabs but could not get their IDs');
        }

        await chrome.tabs.remove(tabIdsToClose);

        return {
          content: [
            {
              type: 'text',
              text: `Closed ${tabIdsToClose.length} tab(s) with URL: ${url}`,
            },
          ],
          isError: false,
        };
      }

      // If tabIds are provided, close those tabs
      if (tabIds && tabIds.length > 0) {
        console.log(`Closing tabs with IDs: ${tabIds.join(', ')}`);

        // Verify that all tabIds exist
        const existingTabs = await Promise.all(
          tabIds.map(async (tabId) => {
            try {
              return await chrome.tabs.get(tabId);
            } catch (error) {
              console.warn(`Tab with ID ${tabId} not found`);
              return null;
            }
          }),
        );

        const validTabIds = existingTabs
          .filter((tab): tab is chrome.tabs.Tab => tab !== null)
          .map((tab) => tab.id)
          .filter((id): id is number => id !== undefined);

        if (validTabIds.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'None of the provided tab IDs exist',
              },
            ],
            isError: false,
          };
        }

        await chrome.tabs.remove(validTabIds);

        const invalidIds = tabIds.filter((id) => !validTabIds.includes(id));
        let msg = `Closed ${validTabIds.length} tab(s)`;
        if (invalidIds.length > 0) {
          msg += `\nInvalid tab IDs: ${invalidIds.join(', ')}`;
        }

        return {
          content: [
            {
              type: 'text',
              text: msg,
            },
          ],
          isError: false,
        };
      }

      // If no tabIds or URL provided, close the current active tab
      console.log('No tabIds or URL provided, closing active tab');
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!activeTab || !activeTab.id) {
        return createErrorResponse('No active tab found');
      }

      await chrome.tabs.remove(activeTab.id);

      return {
        content: [
          {
            type: 'text',
            text: 'Closed active tab',
          },
        ],
        isError: false,
      };
    } catch (error) {
      console.error('Error in CloseTabsTool.execute:', error);
      return createErrorResponse(
        `Error closing tabs: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const closeTabsTool = new CloseTabsTool();

interface GoBackOrForwardToolParams {
  isForward?: boolean;
}

/**
 * Tool for navigating back or forward in browser history
 */
class GoBackOrForwardTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.GO_BACK_OR_FORWARD;

  async execute(args: GoBackOrForwardToolParams): Promise<ToolResult> {
    const { isForward = false } = args;

    console.log(`Attempting to navigate ${isForward ? 'forward' : 'back'} in browser history`);

    try {
      // Get current active tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!activeTab || !activeTab.id) {
        return createErrorResponse('No active tab found');
      }

      // Navigate back or forward based on the isForward parameter
      if (isForward) {
        await chrome.tabs.goForward(activeTab.id);
        console.log(`Navigated forward in tab ID: ${activeTab.id}`);
      } else {
        await chrome.tabs.goBack(activeTab.id);
        console.log(`Navigated back in tab ID: ${activeTab.id}`);
      }

      // Get updated tab information
      const updatedTab = await chrome.tabs.get(activeTab.id);

      return {
        content: [
          {
            type: 'text',
            text: `Navigated ${isForward ? 'forward' : 'back'}\nURL: ${updatedTab.url}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      if (chrome.runtime.lastError) {
        console.error(`Chrome API Error: ${chrome.runtime.lastError.message}`, error);
        return createErrorResponse(`Chrome API Error: ${chrome.runtime.lastError.message}`);
      } else {
        console.error('Error in GoBackOrForwardTool.execute:', error);
        return createErrorResponse(
          `Error navigating ${isForward ? 'forward' : 'back'}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}

export const goBackOrForwardTool = new GoBackOrForwardTool();

interface SwitchTabToolParams {
  tabId: number;
  windowId?: number;
}

/**
 * Tool for switching the active tab
 */
class SwitchTabTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.SWITCH_TAB;

  async execute(args: SwitchTabToolParams): Promise<ToolResult> {
    const { tabId, windowId } = args;

    console.log(`Attempting to switch to tab ID: ${tabId} in window ID: ${windowId}`);

    try {
      if (windowId !== undefined) {
        await chrome.windows.update(windowId, { focused: true });
      }
      await chrome.tabs.update(tabId, { active: true });

      const updatedTab = await chrome.tabs.get(tabId);

      return {
        content: [
          {
            type: 'text',
            text: `Switched to tab\nURL: ${updatedTab.url}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      if (chrome.runtime.lastError) {
        console.error(`Chrome API Error: ${chrome.runtime.lastError.message}`, error);
        return createErrorResponse(`Chrome API Error: ${chrome.runtime.lastError.message}`);
      } else {
        console.error('Error in SwitchTabTool.execute:', error);
        return createErrorResponse(
          `Error switching tab: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}

export const switchTabTool = new SwitchTabTool();
