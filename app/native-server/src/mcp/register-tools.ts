import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import nativeMessagingHostInstance from '../native-messaging-host';
import { NativeMessageType, TOOL_NAMES, TOOL_SCHEMAS } from 'mcp-chrome-shared';
import {
  getDynamicToolSchemas,
  getDynamicTool,
  isDynamicTool,
  registerDynamicTools,
  unregisterDynamicTools,
} from './dynamic-tools-registry';
import { getActiveServers } from './mcp-server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LOG_FILE = path.join(os.tmpdir(), 'mcp-chrome-native.log');
function logToFile(msg: string) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] [register-tools] ${msg}\n`);
}

// Debounce timeout for sending notifications
let notifyTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Send tools list changed notification to all connected clients
 */
export function notifyToolsListChanged(): void {
  if (notifyTimeout) {
    clearTimeout(notifyTimeout);
  }

  logToFile('notifyToolsListChanged called, scheduling notification...');

  notifyTimeout = setTimeout(async () => {
    const activeServers = getActiveServers();
    logToFile(`Active servers count: ${activeServers.size}`);

    if (activeServers.size === 0) {
      logToFile('Cannot send notification - no active servers');
      return;
    }

    // Notify all active servers
    for (const server of activeServers) {
      try {
        logToFile('Attempting to send notifications/tools/list_changed to a server');
        await server.notification({
          method: 'notifications/tools/list_changed',
        });
        logToFile('Successfully sent notifications/tools/list_changed');
      } catch (error: any) {
        logToFile(`Failed to send notification: ${error?.message || error}\n${error?.stack || ''}`);
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
    // WebMCP 标准格式
    inputSchema: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
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

interface BatchAction {
  name: string;
  args?: Record<string, any>;
}

interface BatchToolArgs {
  actions?: BatchAction[];
  stopOnError?: boolean;
}

function summarizeToolResult(result: CallToolResult): string {
  if (!result.content?.length) {
    return result.isError ? 'Action failed' : 'Action succeeded';
  }

  const firstTextBlock = result.content.find(
    (item): item is { type: 'text'; text: string } => item.type === 'text' && 'text' in item,
  );

  if (!firstTextBlock?.text) {
    return result.isError ? 'Action failed' : 'Action succeeded';
  }

  const normalized = firstTextBlock.text.replace(/\s+/g, ' ').trim();
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

async function handleBatchToolCall(args: BatchToolArgs): Promise<CallToolResult> {
  const { actions, stopOnError = true } = args;

  if (!Array.isArray(actions) || actions.length === 0) {
    return {
      content: [{ type: 'text', text: 'chrome_batch requires a non-empty actions array' }],
      isError: true,
    };
  }

  const results: Array<{
    index: number;
    name: string;
    args: Record<string, any>;
    isError: boolean;
    summary: string;
    content: CallToolResult['content'];
  }> = [];

  for (let index = 0; index < actions.length; index++) {
    const action = actions[index];

    if (!action || typeof action.name !== 'string' || action.name.trim() === '') {
      const errorResult: CallToolResult = {
        content: [{ type: 'text', text: `Invalid action at index ${index}: missing tool name` }],
        isError: true,
      };

      results.push({
        index,
        name: '',
        args: {},
        isError: true,
        summary: summarizeToolResult(errorResult),
        content: errorResult.content,
      });

      if (stopOnError) {
        break;
      }
      continue;
    }

    if (action.name === TOOL_NAMES.BROWSER.BATCH) {
      const errorResult: CallToolResult = {
        content: [{ type: 'text', text: 'chrome_batch cannot call itself recursively' }],
        isError: true,
      };

      results.push({
        index,
        name: action.name,
        args: action.args || {},
        isError: true,
        summary: summarizeToolResult(errorResult),
        content: errorResult.content,
      });

      if (stopOnError) {
        break;
      }
      continue;
    }

    const toolResult = await handleToolCall(action.name, action.args || {});
    results.push({
      index,
      name: action.name,
      args: action.args || {},
      isError: !!toolResult.isError,
      summary: summarizeToolResult(toolResult),
      content: toolResult.content,
    });

    if (toolResult.isError && stopOnError) {
      break;
    }
  }

  const errorCount = results.filter((result) => result.isError).length;
  const stoppedEarly = results.length < actions.length;
  const summaryLines = [
    `Executed ${results.length}/${actions.length} actions`,
    `Errors: ${errorCount}`,
    `Stopped early: ${stoppedEarly ? 'yes' : 'no'}`,
    '',
    ...results.map((result) => {
      const status = result.isError ? 'error' : 'ok';
      return `[${result.index + 1}] ${status} ${result.name}: ${result.summary}`;
    }),
  ];

  return {
    content: [{ type: 'text', text: summaryLines.join('\n') }],
    structuredContent: {
      totalActions: actions.length,
      executedActions: results.length,
      errorCount,
      stoppedEarly,
      stopOnError,
      results,
    },
    isError: errorCount > 0,
  };
}

const handleToolCall = async (name: string, args: any): Promise<CallToolResult> => {
  try {
    if (name === TOOL_NAMES.BROWSER.BATCH) {
      return await handleBatchToolCall(args as BatchToolArgs);
    }

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
        15000,
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
      15000, // 15秒超时
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
