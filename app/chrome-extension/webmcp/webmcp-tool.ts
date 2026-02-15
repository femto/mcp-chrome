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
 * 列出所有可用的网站工具
 */
class ListWebMCPToolsTool extends BaseBrowserToolExecutor {
  name = WEBMCP_TOOL_NAMES.LIST_TOOLS;

  async execute(args: { tabId?: number }): Promise<ToolResult> {
    try {
      const { tabId } = args;

      if (tabId) {
        // 获取指定标签页的工具
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

      // 列出所有已注册的工具
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

      // 从 Worldbook API 获取所有配置的网站
      const configuredSites = await getConfiguredSites();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                registeredTools: result,
                configuredSites,
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
        `获取工具列表失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * 检测指定标签页或当前页面并注册工具
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
              text: '当前页面没有匹配的网站工具配置',
            },
          ],
          isError: false,
        };
      }

      // 获取工具详情用于生成推荐
      const toolDetails = getTabTools(result.tabId);
      const toolDescriptions = toolDetails
        .map((t) => {
          const paramNames = Object.keys(t.inputSchema?.properties || {});
          return `  - ${t.name}(${paramNames.join(', ')}): ${t.description}`;
        })
        .join('\n');

      const recommendation = `
⚠️ IMPORTANT: This site has WebMCP support with precise tools.
ALWAYS prefer webmcp_call_tool over general browser automation (chrome_click_element, chrome_fill_or_select, etc.)

Available WebMCP tools for ${result.siteName}:
${toolDescriptions}

Example usage:
  webmcp_call_tool({ toolName: "${toolDetails[0]?.name || 'tool_name'}", params: {...} })

WebMCP tools are MORE RELIABLE than clicking/typing because they use site-specific APIs.
`;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `已为 ${result.siteName} 注册 ${result.tools.length} 个工具`,
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
        `检测工具失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * 调用网站工具
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
        return createErrorResponse('参数 [toolName] 是必需的');
      }

      // 如果没有指定 tabId，使用当前活动标签页
      if (!tabId) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          return createErrorResponse('没有活动的标签页');
        }
        tabId = tab.id;
      }

      // 检查工具是否已注册
      const tools = getTabTools(tabId);
      const tool = tools.find((t) => t.name === toolName);

      if (!tool) {
        // 尝试自动检测并注册
        const detected = await detectAndRegisterTools();
        if (!detected) {
          return createErrorResponse(
            `工具 "${toolName}" 未找到。请先访问支持的网站并使用 webmcp_detect_tools 检测工具。`,
          );
        }

        const newTools = getTabTools(tabId);
        const newTool = newTools.find((t) => t.name === toolName);
        if (!newTool) {
          return createErrorResponse(`工具 "${toolName}" 在当前网站不可用`);
        }
      }

      // 执行工具
      const result = await executeWebMCPTool(tabId, toolName, params);

      if (result.error) {
        return createErrorResponse(`工具执行失败: ${result.error}`);
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
        `调用工具失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

// 导出工具实例
export const listWebMCPToolsTool = new ListWebMCPToolsTool();
export const detectWebMCPToolsTool = new DetectWebMCPToolsTool();
export const callWebMCPToolTool = new CallWebMCPToolTool();
