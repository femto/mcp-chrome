import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';

const DEBUGGER_PROTOCOL_VERSION = '1.3';
const DEFAULT_MAX_MESSAGES = 100;

interface ConsoleToolParams {
  url?: string;
  includeExceptions?: boolean;
  maxMessages?: number;
}

interface ConsoleMessage {
  timestamp: number;
  level: string;
  text: string;
  args?: any[];
  source?: string;
  url?: string;
  lineNumber?: number;
  stackTrace?: any;
}

interface ConsoleException {
  timestamp: number;
  text: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  stackTrace?: any;
}

interface ConsoleResult {
  success: boolean;
  message: string;
  tabId: number;
  tabUrl: string;
  tabTitle: string;
  captureStartTime: number;
  captureEndTime: number;
  totalDurationMs: number;
  messages: ConsoleMessage[];
  exceptions: ConsoleException[];
  messageCount: number;
  exceptionCount: number;
  messageLimitReached: boolean;
}

/**
 * Tool for capturing console output from browser tabs
 */
class ConsoleTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.CONSOLE;

  async execute(args: ConsoleToolParams): Promise<ToolResult> {
    const { url, includeExceptions = true, maxMessages = DEFAULT_MAX_MESSAGES } = args;

    let targetTab: chrome.tabs.Tab;

    try {
      if (url) {
        // Navigate to the specified URL
        targetTab = await this.navigateToUrl(url);
      } else {
        // Use current active tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.id) {
          return createErrorResponse('No active tab found and no URL provided.');
        }
        targetTab = activeTab;
      }

      if (!targetTab?.id) {
        return createErrorResponse('Failed to identify target tab.');
      }

      const tabId = targetTab.id;

      // Capture console messages (one-time capture)
      const result = await this.captureConsoleMessages(tabId, {
        includeExceptions,
        maxMessages,
      });

      // Format console messages as readable text
      const lines: string[] = [];
      lines.push(`Console capture for: ${result.tabTitle}`);
      lines.push(`URL: ${result.tabUrl}`);
      lines.push(`Duration: ${result.totalDurationMs}ms`);
      lines.push(`Messages: ${result.messageCount}, Exceptions: ${result.exceptionCount}`);
      if (result.messageLimitReached) {
        lines.push('(Message limit reached)');
      }
      lines.push('');

      // Format messages
      if (result.messages.length > 0) {
        lines.push('--- Console Messages ---');
        for (const msg of result.messages) {
          const level = msg.level.toUpperCase().padEnd(7);
          lines.push(`[${level}] ${msg.text}`);
          if (msg.url) lines.push(`         at ${msg.url}:${msg.lineNumber || '?'}`);
        }
        lines.push('');
      }

      // Format exceptions
      if (result.exceptions.length > 0) {
        lines.push('--- Exceptions ---');
        for (const ex of result.exceptions) {
          lines.push(`[ERROR] ${ex.text}`);
          if (ex.url)
            lines.push(`        at ${ex.url}:${ex.lineNumber || '?'}:${ex.columnNumber || '?'}`);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: lines.join('\n'),
          },
        ],
        isError: false,
      };
    } catch (error: any) {
      console.error('ConsoleTool: Critical error during execute:', error);
      return createErrorResponse(`Error in ConsoleTool: ${error.message || String(error)}`);
    }
  }

  private async navigateToUrl(url: string): Promise<chrome.tabs.Tab> {
    // Check if URL is already open
    const existingTabs = await chrome.tabs.query({ url });

    if (existingTabs.length > 0 && existingTabs[0]?.id) {
      const tab = existingTabs[0];
      // Activate the existing tab
      await chrome.tabs.update(tab.id!, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return tab;
    } else {
      // Create new tab with the URL
      const newTab = await chrome.tabs.create({ url, active: true });
      // Wait for tab to be ready
      await this.waitForTabReady(newTab.id!);
      return newTab;
    }
  }

  private async waitForTabReady(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      const checkTab = async () => {
        try {
          const tab = await chrome.tabs.get(tabId);
          if (tab.status === 'complete') {
            resolve();
          } else {
            setTimeout(checkTab, 100);
          }
        } catch (error) {
          // Tab might be closed, resolve anyway
          resolve();
        }
      };
      checkTab();
    });
  }

  private formatConsoleArgs(args: any[]): string {
    if (!args || args.length === 0) return '';

    return args
      .map((arg) => {
        if (arg.type === 'string') {
          return arg.value || '';
        } else if (arg.type === 'number') {
          return String(arg.value || '');
        } else if (arg.type === 'boolean') {
          return String(arg.value || '');
        } else if (arg.type === 'object') {
          return arg.description || '[Object]';
        } else if (arg.type === 'undefined') {
          return 'undefined';
        } else if (arg.type === 'function') {
          return arg.description || '[Function]';
        } else {
          return arg.description || arg.value || String(arg);
        }
      })
      .join(' ');
  }

  private async captureConsoleMessages(
    tabId: number,
    options: {
      includeExceptions: boolean;
      maxMessages: number;
    },
  ): Promise<ConsoleResult> {
    const { includeExceptions, maxMessages } = options;
    const startTime = Date.now();
    const messages: ConsoleMessage[] = [];
    const exceptions: ConsoleException[] = [];
    let limitReached = false;

    try {
      // Get tab information
      const tab = await chrome.tabs.get(tabId);

      // Check if debugger is already attached
      const targets = await chrome.debugger.getTargets();
      const existingTarget = targets.find(
        (t) => t.tabId === tabId && t.attached && t.type === 'page',
      );
      if (existingTarget && !existingTarget.extensionId) {
        throw new Error(
          `Debugger is already attached to tab ${tabId} by another tool (e.g., DevTools).`,
        );
      }

      // Attach debugger
      try {
        await chrome.debugger.attach({ tabId }, DEBUGGER_PROTOCOL_VERSION);
      } catch (error: any) {
        if (error.message?.includes('Cannot attach to the target with an attached client')) {
          throw new Error(
            `Debugger is already attached to tab ${tabId}. This might be DevTools or another extension.`,
          );
        }
        throw error;
      }

      // Set up event listener to collect messages
      const collectedMessages: any[] = [];
      const collectedExceptions: any[] = [];

      const eventListener = (source: chrome.debugger.Debuggee, method: string, params?: any) => {
        if (source.tabId !== tabId) return;

        if (method === 'Log.entryAdded' && params?.entry) {
          collectedMessages.push(params.entry);
        } else if (method === 'Runtime.consoleAPICalled' && params) {
          // Convert Runtime.consoleAPICalled to Log.entryAdded format
          const logEntry = {
            timestamp: params.timestamp,
            level: params.type || 'log',
            text: this.formatConsoleArgs(params.args || []),
            source: 'console-api',
            url: params.stackTrace?.callFrames?.[0]?.url,
            lineNumber: params.stackTrace?.callFrames?.[0]?.lineNumber,
            stackTrace: params.stackTrace,
            args: params.args,
          };
          collectedMessages.push(logEntry);
        } else if (
          method === 'Runtime.exceptionThrown' &&
          includeExceptions &&
          params?.exceptionDetails
        ) {
          collectedExceptions.push(params.exceptionDetails);
        }
      };

      chrome.debugger.onEvent.addListener(eventListener);

      try {
        // Enable Runtime domain first to capture console API calls and exceptions
        await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');

        // Also enable Log domain to capture other log entries
        await chrome.debugger.sendCommand({ tabId }, 'Log.enable');

        // Wait for all messages to be flushed
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Process collected messages
        for (const entry of collectedMessages) {
          if (messages.length >= maxMessages) {
            limitReached = true;
            break;
          }

          const message: ConsoleMessage = {
            timestamp: entry.timestamp,
            level: entry.level || 'log',
            text: entry.text || '',
            source: entry.source,
            url: entry.url,
            lineNumber: entry.lineNumber,
          };

          if (entry.stackTrace) {
            message.stackTrace = entry.stackTrace;
          }

          if (entry.args && Array.isArray(entry.args)) {
            message.args = entry.args;
          }

          messages.push(message);
        }

        // Process collected exceptions
        for (const exceptionDetails of collectedExceptions) {
          const exception: ConsoleException = {
            timestamp: Date.now(),
            text:
              exceptionDetails.text ||
              exceptionDetails.exception?.description ||
              'Unknown exception',
            url: exceptionDetails.url,
            lineNumber: exceptionDetails.lineNumber,
            columnNumber: exceptionDetails.columnNumber,
          };

          if (exceptionDetails.stackTrace) {
            exception.stackTrace = exceptionDetails.stackTrace;
          }

          exceptions.push(exception);
        }
      } finally {
        // Clean up
        chrome.debugger.onEvent.removeListener(eventListener);

        try {
          await chrome.debugger.sendCommand({ tabId }, 'Runtime.disable');
        } catch (e) {
          console.warn(`ConsoleTool: Error disabling Runtime for tab ${tabId}:`, e);
        }

        try {
          await chrome.debugger.sendCommand({ tabId }, 'Log.disable');
        } catch (e) {
          console.warn(`ConsoleTool: Error disabling Log for tab ${tabId}:`, e);
        }

        try {
          await chrome.debugger.detach({ tabId });
        } catch (e) {
          console.warn(`ConsoleTool: Error detaching debugger for tab ${tabId}:`, e);
        }
      }

      const endTime = Date.now();

      // Sort messages by timestamp
      messages.sort((a, b) => a.timestamp - b.timestamp);
      exceptions.sort((a, b) => a.timestamp - b.timestamp);

      return {
        success: true,
        message: `Console capture completed for tab ${tabId}. ${messages.length} messages, ${exceptions.length} exceptions captured.`,
        tabId,
        tabUrl: tab.url || '',
        tabTitle: tab.title || '',
        captureStartTime: startTime,
        captureEndTime: endTime,
        totalDurationMs: endTime - startTime,
        messages,
        exceptions,
        messageCount: messages.length,
        exceptionCount: exceptions.length,
        messageLimitReached: limitReached,
      };
    } catch (error: any) {
      console.error(`ConsoleTool: Error capturing console messages for tab ${tabId}:`, error);
      throw error;
    }
  }
}

export const consoleTool = new ConsoleTool();
