import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { ExecutionWorld } from '@/common/constants';

interface InjectScriptParam {
  url?: string;
}
interface ScriptConfig {
  type: ExecutionWorld;
  jsScript: string;
}

interface SendCommandToInjectScriptToolParam {
  tabId?: number;
  eventName: string;
  payload?: string;
}

const injectedTabs = new Map();
class InjectScriptTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.INJECT_SCRIPT;
  async execute(args: InjectScriptParam & ScriptConfig): Promise<ToolResult> {
    try {
      const { url, type, jsScript } = args;
      let tab;

      if (!type || !jsScript) {
        return createErrorResponse('Param [type] and [jsScript] is required');
      }

      if (url) {
        // If URL is provided, check if it's already open
        console.log(`Checking if URL is already open: ${url}`);
        const allTabs = await chrome.tabs.query({});

        // Find tab with matching URL
        const matchingTabs = allTabs.filter((t) => {
          // Normalize URLs for comparison (remove trailing slashes)
          const tabUrl = t.url?.endsWith('/') ? t.url.slice(0, -1) : t.url;
          const targetUrl = url.endsWith('/') ? url.slice(0, -1) : url;
          return tabUrl === targetUrl;
        });

        if (matchingTabs.length > 0) {
          // Use existing tab
          tab = matchingTabs[0];
          console.log(`Found existing tab with URL: ${url}, tab ID: ${tab.id}`);
        } else {
          // Create new tab with the URL
          console.log(`No existing tab found with URL: ${url}, creating new tab`);
          tab = await chrome.tabs.create({ url, active: true });

          // Wait for page to load
          console.log('Waiting for page to load...');
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      } else {
        // Use active tab
        const tabs = await chrome.tabs.query({ active: true });
        if (!tabs[0]) {
          return createErrorResponse('No active tab found');
        }
        tab = tabs[0];
      }

      if (!tab.id) {
        return createErrorResponse('Tab has no ID');
      }

      // Make sure tab is active
      await chrome.tabs.update(tab.id, { active: true });

      const res = await handleInject(tab.id!, { ...args });

      return {
        content: [
          {
            type: 'text',
            text: res.injected ? 'Script injected successfully' : 'Script injection failed',
          },
        ],
        isError: false,
      };
    } catch (error) {
      console.error('Error in InjectScriptTool.execute:', error);
      return createErrorResponse(
        `Inject script error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

class SendCommandToInjectScriptTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.SEND_COMMAND_TO_INJECT_SCRIPT;
  async execute(args: SendCommandToInjectScriptToolParam): Promise<ToolResult> {
    try {
      const { tabId, eventName, payload } = args;

      if (!eventName) {
        return createErrorResponse('Param [eventName] is required');
      }

      if (tabId) {
        const tabExists = await isTabExists(tabId);
        if (!tabExists) {
          return createErrorResponse('The tab:[tabId] is not exists');
        }
      }

      let finalTabId: number | undefined = tabId;

      if (finalTabId === undefined) {
        // Use active tab
        const tabs = await chrome.tabs.query({ active: true });
        if (!tabs[0]) {
          return createErrorResponse('No active tab found');
        }
        finalTabId = tabs[0].id;
      }

      if (!finalTabId) {
        return createErrorResponse('No active tab found');
      }

      if (!injectedTabs.has(finalTabId)) {
        throw new Error('No script injected in this tab.');
      }
      const result = await chrome.tabs.sendMessage(finalTabId, {
        action: eventName,
        payload,
        targetWorld: injectedTabs.get(finalTabId).type, // The bridge uses this to decide whether to forward to MAIN world.
      });

      // Format result as readable text
      let text: string;
      if (result === null || result === undefined) {
        text = 'Command executed (no return value)';
      } else if (typeof result === 'string') {
        text = result;
      } else {
        text = JSON.stringify(result, null, 2);
      }

      return {
        content: [
          {
            type: 'text',
            text: text,
          },
        ],
        isError: false,
      };
    } catch (error) {
      console.error('Error in InjectScriptTool.execute:', error);
      return createErrorResponse(
        `Inject script error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

async function isTabExists(tabId: number) {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch (error) {
    // An error is thrown if the tab doesn't exist.
    return false;
  }
}

/**
 * @description Handles the injection of user scripts into a specific tab.
 * @param {number} tabId - The ID of the target tab.
 * @param {object} scriptConfig - The configuration object for the script.
 */
async function handleInject(tabId: number, scriptConfig: ScriptConfig) {
  if (injectedTabs.has(tabId)) {
    // If already injected, run cleanup first to ensure a clean state.
    console.log(`Tab ${tabId} already has injections. Cleaning up first.`);
    await handleCleanup(tabId);
  }
  const { type, jsScript } = scriptConfig;
  const hasMain = type === ExecutionWorld.MAIN;

  if (hasMain) {
    // The bridge is essential for MAIN world communication and cleanup.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['inject-scripts/inject-bridge.js'],
      world: ExecutionWorld.ISOLATED,
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (code) => new Function(code)(),
      args: [jsScript],
      world: ExecutionWorld.MAIN,
    });
  } else {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (code) => new Function(code)(),
      args: [jsScript],
      world: ExecutionWorld.ISOLATED,
    });
  }
  injectedTabs.set(tabId, scriptConfig);
  console.log(`Scripts successfully injected into tab ${tabId}.`);
  return { injected: true };
}

/**
 * @description Triggers the cleanup process in a specific tab.
 * @param {number} tabId - The ID of the target tab.
 */
async function handleCleanup(tabId: number) {
  if (!injectedTabs.has(tabId)) return;
  // Send cleanup signal. The bridge will forward it to the MAIN world.
  chrome.tabs
    .sendMessage(tabId, { type: 'chrome-mcp:cleanup' })
    .catch((err) =>
      console.warn(`Could not send cleanup message to tab ${tabId}. It might have been closed.`),
    );

  injectedTabs.delete(tabId);
  console.log(`Cleanup signal sent to tab ${tabId}. State cleared.`);
}

export const injectScriptTool = new InjectScriptTool();
export const sendCommandToInjectScriptTool = new SendCommandToInjectScriptTool();

// --- Automatic Cleanup Listeners ---
chrome.tabs.onRemoved.addListener((tabId) => {
  if (injectedTabs.has(tabId)) {
    console.log(`Tab ${tabId} closed. Cleaning up state.`);
    injectedTabs.delete(tabId);
  }
});
