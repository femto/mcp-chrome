import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';

const DEFAULT_NETWORK_REQUEST_TIMEOUT = 30000; // For sending a single request via content script

interface NetworkRequestToolParams {
  url: string; // URL is always required
  method?: string; // Defaults to GET
  headers?: Record<string, string>; // User-provided headers
  body?: any; // User-provided body
  timeout?: number; // Timeout for the network request itself
}

/**
 * NetworkRequestTool - Sends network requests based on provided parameters.
 */
class NetworkRequestTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.NETWORK_REQUEST;

  async execute(args: NetworkRequestToolParams): Promise<ToolResult> {
    const {
      url,
      method = 'GET',
      headers = {},
      body,
      timeout = DEFAULT_NETWORK_REQUEST_TIMEOUT,
    } = args;

    console.log(`NetworkRequestTool: Executing with options:`, args);

    if (!url) {
      return createErrorResponse('URL parameter is required.');
    }

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) {
        return createErrorResponse('No active tab found or tab has no ID.');
      }
      const activeTabId = tabs[0].id;

      // Ensure content script is available in the target tab
      await this.injectContentScript(activeTabId, ['inject-scripts/network-helper.js']);

      console.log(
        `NetworkRequestTool: Sending to content script: URL=${url}, Method=${method}, Headers=${Object.keys(headers).join(',')}, BodyType=${typeof body}`,
      );

      const resultFromContentScript = await this.sendMessageToTab(activeTabId, {
        action: TOOL_MESSAGE_TYPES.NETWORK_SEND_REQUEST,
        url: url,
        method: method,
        headers: headers,
        body: body,
        timeout: timeout,
      });

      console.log(`NetworkRequestTool: Response from content script:`, resultFromContentScript);

      // Format response as readable text
      const lines: string[] = [];
      if (resultFromContentScript?.success) {
        lines.push(`Request to ${url} completed`);
        lines.push(`Method: ${method}`);
        if (resultFromContentScript.status) {
          lines.push(`Status: ${resultFromContentScript.status}`);
        }
        lines.push('');
        // Include response body if available
        if (resultFromContentScript.data) {
          if (typeof resultFromContentScript.data === 'string') {
            lines.push(resultFromContentScript.data);
          } else {
            lines.push(JSON.stringify(resultFromContentScript.data, null, 2));
          }
        }
      } else {
        lines.push(`Request to ${url} failed`);
        if (resultFromContentScript?.error) {
          lines.push(`Error: ${resultFromContentScript.error}`);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: lines.join('\n'),
          },
        ],
        isError: !resultFromContentScript?.success,
      };
    } catch (error: any) {
      console.error('NetworkRequestTool: Error sending network request:', error);
      return createErrorResponse(
        `Error sending network request: ${error.message || String(error)}`,
      );
    }
  }
}

export const networkRequestTool = new NetworkRequestTool();
