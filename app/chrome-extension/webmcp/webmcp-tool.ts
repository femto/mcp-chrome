/**
 * WebMCP Tool - MCP 工具定义
 * 让 Claude 可以调用网站特定的工具
 */

import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '@/entrypoints/background/tools/base-browser';
import {
  executeWebMCPTool,
  detectAndRegisterTools,
  getAllRegisteredTools,
  getTabTools,
  getConfiguredSites,
} from './webmcp-manager';

// WebMCP 工具名称常量
const WEBMCP_TOOL_NAMES = {
  LIST_TOOLS: 'webmcp_list_tools',
  DETECT_TOOLS: 'webmcp_detect_tools',
  CALL_TOOL: 'webmcp_call_tool',
};

/**
 * List all available WebMCP tools
 */
class ListWebMCPToolsTool extends BaseBrowserToolExecutor {
  name = WEBMCP_TOOL_NAMES.LIST_TOOLS;

  async execute(args: { tabId?: number }): Promise<ToolResult> {
    try {
      const { tabId } = args;

      if (tabId) {
        // Get tools for specific tab
        const tools = getTabTools(tabId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  tabId,
                  tools: tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: t.inputSchema,
                  })),
                },
                null,
                2,
              ),
            },
          ],
          isError: false,
        };
      }

      // List all registered tools
      const allTools = getAllRegisteredTools();
      const result: any[] = [];

      allTools.forEach((config, tid) => {
        result.push({
          tabId: tid,
          siteName: config.siteName,
          tools: config.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });
      });

      // Get available sites from Worldbook API (visiting these sites will auto-register tools)
      const availableSites = await getConfiguredSites();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                registeredTools: result,
                availableSites,
              },
              null,
              2,
            ),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(
        `Failed to get tool list: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Detect and register WebMCP tools for specified tab or current active tab
 */
class DetectWebMCPToolsTool extends BaseBrowserToolExecutor {
  name = WEBMCP_TOOL_NAMES.DETECT_TOOLS;

  async execute(args: { tabId?: number }): Promise<ToolResult> {
    try {
      const { tabId } = args;
      const result = await detectAndRegisterTools(tabId);

      if (!result) {
        return {
          content: [
            {
              type: 'text',
              text: 'No matching WebMCP configuration found for current page',
            },
          ],
          isError: false,
        };
      }

      // Get tool details for generating usage info
      const toolDetails = getTabTools(result.tabId);
      const topLevelTools = toolDetails.map((t) => `  - ${result.siteName}_${t.name}`).join('\n');

      const recommendation = `
Tools registered. You can call them directly at top level:
${topLevelTools}

Note: If your MCP client doesn't support notifications/tools/list_changed,
use webmcp_call_tool({ toolName: "${toolDetails[0]?.name || 'tool_name'}", params: {...} }) as fallback.

Prefer these WebMCP tools over general browser automation (chrome_click_element, etc.) - they use site-specific APIs and are more reliable.
`;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Registered ${result.tools.length} tools for ${result.siteName}`,
                tabId: result.tabId,
                siteName: result.siteName,
                tools: result.tools,
                recommendation: recommendation.trim(),
              },
              null,
              2,
            ),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(
        `Failed to detect tools: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Call a WebMCP site-specific tool
 */
class CallWebMCPToolTool extends BaseBrowserToolExecutor {
  name = 'webmcp_call_tool';

  async execute(args: {
    tabId?: number;
    toolName: string;
    params?: Record<string, any>;
  }): Promise<ToolResult> {
    try {
      const { toolName, params = {} } = args;
      let { tabId } = args;

      if (!toolName) {
        return createErrorResponse('Parameter [toolName] is required');
      }

      // If tabId not specified, use current active tab
      if (!tabId) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          return createErrorResponse('No active tab found');
        }
        tabId = tab.id;
      }

      // Check if tool is registered
      const tools = getTabTools(tabId);
      const tool = tools.find((t) => t.name === toolName);

      if (!tool) {
        // Try auto-detect and register
        const detected = await detectAndRegisterTools();
        if (!detected) {
          return createErrorResponse(
            `Tool "${toolName}" not found. Please visit a supported website and use webmcp_detect_tools first.`,
          );
        }

        const newTools = getTabTools(tabId);
        const newTool = newTools.find((t) => t.name === toolName);
        if (!newTool) {
          return createErrorResponse(`Tool "${toolName}" is not available on current website`);
        }
      }

      // Execute the tool
      const result = await executeWebMCPTool(tabId, toolName, params);

      if (result.error) {
        return createErrorResponse(`Tool execution failed: ${result.error}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                toolName,
                params,
                result: result.result,
              },
              null,
              2,
            ),
          },
        ],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(
        `Failed to call tool: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

// Export tool instances
export const listWebMCPToolsTool = new ListWebMCPToolsTool();
export const detectWebMCPToolsTool = new DetectWebMCPToolsTool();
export const callWebMCPToolTool = new CallWebMCPToolTool();
