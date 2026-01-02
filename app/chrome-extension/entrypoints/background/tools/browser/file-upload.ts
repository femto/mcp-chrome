import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';

interface FileUploadToolParams {
  selector: string; // CSS selector for the file input element
  filePath?: string; // Local file path
  fileUrl?: string; // URL to download file from
  base64Data?: string; // Base64 encoded file data
  fileName?: string; // Optional filename when using base64 or URL
  multiple?: boolean; // Whether to allow multiple files
}

/**
 * Tool for uploading files to web forms using Chrome DevTools Protocol
 * Similar to Playwright's setInputFiles implementation
 */
class FileUploadTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.FILE_UPLOAD;
  private activeDebuggers: Map<number, boolean> = new Map();

  constructor() {
    super();
    // Clean up debuggers on tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.activeDebuggers.has(tabId)) {
        this.cleanupDebugger(tabId);
      }
    });
  }

  /**
   * Execute file upload operation using Chrome DevTools Protocol
   */
  async execute(args: FileUploadToolParams): Promise<ToolResult> {
    const { selector, filePath, fileUrl, base64Data, fileName, multiple = false } = args;

    console.log(`Starting file upload operation with options:`, args);

    // Validate input
    if (!selector) {
      return createErrorResponse('Selector is required for file upload');
    }

    if (!filePath && !fileUrl && !base64Data) {
      return createErrorResponse('One of filePath, fileUrl, or base64Data must be provided');
    }

    let tabId: number | undefined;

    try {
      // Get current tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) {
        return createErrorResponse('No active tab found');
      }
      tabId = tabs[0].id;

      // Prepare file paths
      let files: string[] = [];

      if (filePath) {
        // Direct file path provided
        files = [filePath];
      } else if (fileUrl || base64Data) {
        // For URL or base64, we need to use the native messaging host
        // to download or save the file temporarily
        const tempFilePath = await this.prepareFileFromRemote({
          fileUrl,
          base64Data,
          fileName: fileName || 'uploaded-file',
        });
        if (!tempFilePath) {
          return createErrorResponse('Failed to prepare file for upload');
        }
        files = [tempFilePath];
      }

      // Attach debugger to the tab
      await this.attachDebugger(tabId);

      // Enable necessary CDP domains
      await chrome.debugger.sendCommand({ tabId }, 'DOM.enable', {});
      await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable', {});

      // Get the document
      const { root } = (await chrome.debugger.sendCommand({ tabId }, 'DOM.getDocument', {
        depth: -1,
        pierce: true,
      })) as { root: { nodeId: number } };

      // Find the file input element using the selector
      const { nodeId } = (await chrome.debugger.sendCommand({ tabId }, 'DOM.querySelector', {
        nodeId: root.nodeId,
        selector: selector,
      })) as { nodeId: number };

      if (!nodeId || nodeId === 0) {
        throw new Error(`Element with selector "${selector}" not found`);
      }

      // Verify it's actually a file input
      const { node } = (await chrome.debugger.sendCommand({ tabId }, 'DOM.describeNode', {
        nodeId,
      })) as { node: { nodeName: string; attributes?: string[] } };

      if (node.nodeName !== 'INPUT') {
        throw new Error(`Element with selector "${selector}" is not an input element`);
      }

      // Check if it's a file input by looking for type="file" in attributes
      const attributes = node.attributes || [];
      let isFileInput = false;
      for (let i = 0; i < attributes.length; i += 2) {
        if (attributes[i] === 'type' && attributes[i + 1] === 'file') {
          isFileInput = true;
          break;
        }
      }

      if (!isFileInput) {
        throw new Error(`Element with selector "${selector}" is not a file input (type="file")`);
      }

      // Set the files on the input element
      // This is the key CDP command that Playwright and Puppeteer use
      await chrome.debugger.sendCommand({ tabId }, 'DOM.setFileInputFiles', {
        nodeId: nodeId,
        files: files,
      });

      // Trigger change event to ensure the page reacts to the file upload
      await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
        expression: `
            (function() {
              const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
              if (element) {
                const event = new Event('change', { bubbles: true });
                element.dispatchEvent(event);
                return true;
              }
              return false;
            })()
          `,
      });

      // Clean up debugger
      await this.detachDebugger(tabId);

      return {
        content: [
          {
            type: 'text',
            text: `File(s) uploaded successfully\nSelector: ${selector}\nFiles: ${files.join(', ')}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      console.error('Error in file upload operation:', error);

      // Clean up debugger if attached
      if (tabId !== undefined && this.activeDebuggers.has(tabId)) {
        await this.detachDebugger(tabId);
      }

      return createErrorResponse(
        `Error uploading file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Attach debugger to a tab
   */
  private async attachDebugger(tabId: number): Promise<void> {
    // Check if debugger is already attached
    const targets = await chrome.debugger.getTargets();
    const existingTarget = targets.find((t) => t.tabId === tabId && t.attached);

    if (existingTarget) {
      if (existingTarget.extensionId === chrome.runtime.id) {
        // Our extension already attached
        console.log('Debugger already attached by this extension');
        return;
      } else {
        throw new Error(
          'Debugger is already attached to this tab by another extension or DevTools',
        );
      }
    }

    // Attach debugger
    await chrome.debugger.attach({ tabId }, '1.3');
    this.activeDebuggers.set(tabId, true);
    console.log(`Debugger attached to tab ${tabId}`);
  }

  /**
   * Detach debugger from a tab
   */
  private async detachDebugger(tabId: number): Promise<void> {
    if (!this.activeDebuggers.has(tabId)) {
      return;
    }

    try {
      await chrome.debugger.detach({ tabId });
      console.log(`Debugger detached from tab ${tabId}`);
    } catch (error) {
      console.warn(`Error detaching debugger from tab ${tabId}:`, error);
    } finally {
      this.activeDebuggers.delete(tabId);
    }
  }

  /**
   * Clean up debugger connection
   */
  private cleanupDebugger(tabId: number): void {
    this.activeDebuggers.delete(tabId);
  }

  /**
   * Prepare file from URL or base64 data using native messaging host
   */
  private async prepareFileFromRemote(options: {
    fileUrl?: string;
    base64Data?: string;
    fileName: string;
  }): Promise<string | null> {
    const { fileUrl, base64Data, fileName } = options;

    return new Promise((resolve) => {
      const requestId = `file-upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const timeout = setTimeout(() => {
        console.error('File preparation request timed out');
        resolve(null);
      }, 30000); // 30 second timeout

      // Create listener for the response
      const handleMessage = (message: any) => {
        if (
          message.type === 'file_operation_response' &&
          message.responseToRequestId === requestId
        ) {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(handleMessage);

          if (message.payload?.success && message.payload?.filePath) {
            resolve(message.payload.filePath);
          } else {
            console.error(
              'Native host failed to prepare file:',
              message.error || message.payload?.error,
            );
            resolve(null);
          }
        }
      };

      // Add listener
      chrome.runtime.onMessage.addListener(handleMessage);

      // Send message to background script to forward to native host
      chrome.runtime
        .sendMessage({
          type: 'forward_to_native',
          message: {
            type: 'file_operation',
            requestId: requestId,
            payload: {
              action: 'prepareFile',
              fileUrl,
              base64Data,
              fileName,
            },
          },
        })
        .catch((error) => {
          console.error('Error sending message to background:', error);
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(handleMessage);
          resolve(null);
        });
    });
  }
}

export const fileUploadTool = new FileUploadTool();
