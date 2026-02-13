import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import nativeMessagingHostInstance from '../native-messaging-host';
import { NativeMessageType, TOOL_SCHEMAS } from 'chrome-mcp-shared';
import {
  getDynamicToolSchemas,
  getDynamicTool,
  isDynamicTool,
  registerDynamicTools,
  unregisterDynamicTools,
} from './dynamic-tools-registry';
import { mcpServer } from './mcp-server';

// Debounce timeout for sending notifications
let notifyTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Send tools list changed notification to connected clients
 */
export function notifyToolsListChanged(): void {
  if (notifyTimeout) {
    clearTimeout(notifyTimeout);
  }

  notifyTimeout = setTimeout(() => {
    if (mcpServer) {
      try {
        mcpServer.notification({
          method: 'notifications/tools/list_changed',
        });
        console.log('[MCP] Sent notifications/tools/list_changed');
      } catch (error) {
        console.error('[MCP] Failed to send notification:', error);
      }
    }
  }, 300); // 300ms debounce
}

/**
 * Handle dynamic tools update from Chrome extension
 */
export function handleDynamicToolsUpdate(payload: {
  action: 'register' | 'unregister';
  tabId: number;
  siteName?: string;
  tools?: Array<{
    name: string;
    description: string;
    params: Array<{
      name: string;
      type: string;
      description: string;
      required?: boolean;
    }>;
  }>;
}): void {
  let changed = false;

  if (payload.action === 'register' && payload.siteName && payload.tools) {
    changed = registerDynamicTools(payload.tabId, payload.siteName, payload.tools);
  } else if (payload.action === 'unregister') {
    changed = unregisterDynamicTools(payload.tabId);
  }

  if (changed) {
    notifyToolsListChanged();
  }
}

export const setupTools = (server: Server) => {
  // List tools handler - include static and dynamic tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const staticTools = TOOL_SCHEMAS;
    const dynamicTools = getDynamicToolSchemas();
    return { tools: [...staticTools, ...dynamicTools] };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    handleToolCall(request.params.name, request.params.arguments || {}),
  );
};

const handleToolCall = async (name: string, args: any): Promise<CallToolResult> => {
  try {
    // Check if this is a dynamic tool
    if (isDynamicTool(name)) {
      const dynamicTool = getDynamicTool(name);
      if (!dynamicTool) {
        return {
          content: [{ type: 'text', text: `Dynamic tool ${name} not found` }],
          isError: true,
        };
      }

      // Call the dynamic tool via webmcp_call_tool
      const response = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
        {
          name: 'webmcp_call_tool',
          args: {
            tabId: dynamicTool.tabId,
            toolName: dynamicTool.originalName,
            params: args,
          },
        },
        NativeMessageType.CALL_TOOL,
        30000,
      );

      if (response.status === 'success') {
        return response.data;
      } else {
        return {
          content: [{ type: 'text', text: `Error calling dynamic tool: ${response.error}` }],
          isError: true,
        };
      }
    }

    // Static tool - send directly to Chrome extension
    const response = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
      {
        name,
        args,
      },
      NativeMessageType.CALL_TOOL,
      30000, // 30秒超时
    );
    if (response.status === 'success') {
      return response.data;
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Error calling tool: ${response.error}`,
          },
        ],
        isError: true,
      };
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error calling tool: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
};
