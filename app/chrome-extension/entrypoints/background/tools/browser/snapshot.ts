import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'mcp-chrome-shared';
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';

interface PageSnapshotToolParams {
  selector?: string;
  format?: 'yaml' | 'json';
  includeRefs?: boolean;
}

class PageSnapshotTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.PAGE_SNAPSHOT;

  async execute(args: PageSnapshotToolParams): Promise<ToolResult> {
    const { selector, format = 'yaml', includeRefs = true } = args;

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) {
        return createErrorResponse('No active tab found');
      }

      const tab = tabs[0];
      const tabId = tab.id;
      await this.injectContentScript(tabId, ['inject-scripts/snapshot-helper.js']);

      const result = await this.sendMessageToTab(tabId, {
        action: TOOL_MESSAGE_TYPES.GET_PAGE_SNAPSHOT,
        selector,
        format,
        includeRefs,
      });

      if (!result?.success) {
        return createErrorResponse(result?.error || 'Failed to create page snapshot');
      }

      const parts: string[] = [];
      if (tab.url) parts.push(`URL: ${tab.url}`);
      if (tab.title) parts.push(`Title: ${tab.title}`);
      parts.push(`Format: ${result.format}`);
      parts.push(`Refs: ${result.refCount}`);
      parts.push('');
      parts.push(result.snapshot);

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
      return createErrorResponse(
        `Error creating page snapshot: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const pageSnapshotTool = new PageSnapshotTool();
