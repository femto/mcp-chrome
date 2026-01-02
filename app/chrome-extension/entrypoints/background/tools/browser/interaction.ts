import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';
import { TIMEOUTS, ERROR_MESSAGES } from '@/common/constants';

interface Coordinates {
  x: number;
  y: number;
}

interface ClickToolParams {
  selector?: string; // CSS selector for the element to click
  coordinates?: Coordinates; // Coordinates to click at (x, y relative to viewport)
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

      // Send click message to content script
      const result = await this.sendMessageToTab(tab.id, {
        action: TOOL_MESSAGE_TYPES.CLICK_ELEMENT,
        selector,
        coordinates,
        waitForNavigation,
        timeout,
      });

      // Build readable response
      const parts: string[] = [];
      parts.push(result.message || 'Click operation successful');

      if (coordinates) {
        parts.push(`Clicked at coordinates (${coordinates.x}, ${coordinates.y})`);
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

export const clickTool = new ClickTool();

interface FillToolParams {
  selector: string;
  value: string;
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
    const { selector, value } = args;

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
}

export const fillTool = new FillTool();
