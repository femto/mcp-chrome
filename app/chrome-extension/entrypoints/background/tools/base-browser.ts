import { ToolExecutor } from '@/common/tool-handler';
import type { ToolResult } from '@/common/tool-handler';
import { TIMEOUTS, ERROR_MESSAGES } from '@/common/constants';

const PING_TIMEOUT_MS = 300;

/**
 * Base class for browser tool executors
 */
export abstract class BaseBrowserToolExecutor implements ToolExecutor {
  abstract name: string;
  abstract execute(args: any): Promise<ToolResult>;

  /**
   * Inject content script into tab
   */
  protected async injectContentScript(
    tabId: number,
    files: string[],
    injectImmediately = false,
    world: 'MAIN' | 'ISOLATED' = 'ISOLATED',
    skipPing = false,
  ): Promise<void> {
    console.log(`Injecting ${files.join(', ')} into tab ${tabId}`);

    // check if script is already injected
    if (!skipPing) {
      try {
        const response = await Promise.race([
          chrome.tabs.sendMessage(tabId, { action: `${this.name}_ping` }),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`${this.name} Ping action to tab ${tabId} timed out`)),
              PING_TIMEOUT_MS,
            ),
          ),
        ]);

        if (response && response.status === 'pong') {
          console.log(
            `pong received for action '${this.name}' in tab ${tabId}. Assuming script is active.`,
          );
          return;
        } else {
          console.warn(`Unexpected ping response in tab ${tabId}:`, response);
        }
      } catch (error) {
        console.error(
          `ping content script failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files,
        injectImmediately,
        world,
      });
      console.log(`'${files.join(', ')}' injection successful for tab ${tabId}`);
    } catch (injectionError) {
      const errorMessage =
        injectionError instanceof Error ? injectionError.message : String(injectionError);
      console.error(
        `Content script '${files.join(', ')}' injection failed for tab ${tabId}: ${errorMessage}`,
      );
      throw new Error(
        `${ERROR_MESSAGES.TOOL_EXECUTION_FAILED}: Failed to inject content script in tab ${tabId}: ${errorMessage}`,
      );
    }
  }

  /**
   * Send message to tab
   */
  protected async sendMessageToTab(tabId: number, message: any): Promise<any> {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);

      if (response && response.error) {
        throw new Error(String(response.error));
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `Error sending message to tab ${tabId} for action ${message?.action || 'unknown'}: ${errorMessage}`,
      );

      if (error instanceof Error) {
        throw error;
      }
      throw new Error(errorMessage);
    }
  }
}
