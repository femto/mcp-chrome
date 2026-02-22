import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'mcp-chrome-shared';
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';
import { TIMEOUTS, ERROR_MESSAGES } from '@/common/constants';

interface KeyboardToolParams {
  keys: string; // Required: string representing keys or key combinations to simulate (e.g., "Enter", "Ctrl+C")
  selector?: string; // Optional: CSS selector for target element to send keyboard events to
  delay?: number; // Optional: delay between keystrokes in milliseconds
  useCDP?: boolean; // Optional: use CDP for trusted keyboard events
}

/**
 * Tool for simulating keyboard input on web pages
 */
class KeyboardTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.KEYBOARD;

  /**
   * Execute keyboard operation
   */
  async execute(args: KeyboardToolParams): Promise<ToolResult> {
    const { keys, selector, delay = TIMEOUTS.KEYBOARD_DELAY, useCDP = false } = args;

    console.log(`Starting keyboard operation with options:`, args);

    if (!keys) {
      return createErrorResponse(
        ERROR_MESSAGES.INVALID_PARAMETERS + ': Keys parameter must be provided',
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

      const shouldUseCDP = useCDP || this.shouldUseCdpForKeys(keys);
      if (shouldUseCDP) {
        const cdpResult = await this.sendKeysWithCDP(tab.id, keys, selector);
        if (cdpResult) return cdpResult;
        // Fall back to content-script simulation if CDP fails
      }

      await this.injectContentScript(tab.id, ['inject-scripts/keyboard-helper.js']);

      // Send keyboard simulation message to content script
      const result = await this.sendMessageToTab(tab.id, {
        action: TOOL_MESSAGE_TYPES.SIMULATE_KEYBOARD,
        keys,
        selector,
        delay,
      });

      if (result.error) {
        return createErrorResponse(result.error);
      }

      // Format as readable text
      const lines: string[] = [];
      lines.push(result.message || 'Keyboard operation successful');
      lines.push(`Keys: ${keys}`);
      if (selector) {
        lines.push(`Target: ${selector}`);
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
    } catch (error) {
      console.error('Error in keyboard operation:', error);
      return createErrorResponse(
        `Error simulating keyboard events: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Prefer CDP for keys that rely on trusted events (e.g., PageUp/PageDown)
   */
  private shouldUseCdpForKeys(keys: string): boolean {
    const lowered = keys.toLowerCase();
    return (
      lowered.includes('pageup') ||
      lowered.includes('pagedown') ||
      lowered.includes('home') ||
      lowered.includes('end')
    );
  }

  /**
   * Send keyboard events via Chrome DevTools Protocol (trusted events)
   */
  private async sendKeysWithCDP(
    tabId: number,
    keys: string,
    selector?: string,
  ): Promise<ToolResult | null> {
    const DEBUGGER_VERSION = '1.3';

    try {
      // Check if debugger is already attached
      const targets = await chrome.debugger.getTargets();
      const existingTarget = targets.find(
        (t) => t.tabId === tabId && t.attached && t.type === 'page',
      );

      if (existingTarget && !existingTarget.extensionId) {
        return createErrorResponse(
          'Debugger is already attached to this tab (possibly by DevTools). Please close DevTools and try again.',
        );
      }

      await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION);

      try {
        if (selector) {
          await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
            expression: `
              (function() {
                const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
                if (el) {
                  el.click();
                  el.focus();
                }
              })()
            `,
          });
        }

        const keyCombinations = keys
          .split(',')
          .map((k) => k.trim())
          .filter((k) => k.length > 0);

        for (const combo of keyCombinations) {
          await this.dispatchKeyCombinationCDP(tabId, combo);
        }

        const lines: string[] = [];
        lines.push('Keyboard operation successful (CDP mode)');
        lines.push(`Keys: ${keys}`);
        if (selector) lines.push(`Target: ${selector}`);

        return {
          content: [
            {
              type: 'text',
              text: lines.join('\n'),
            },
          ],
          isError: false,
        };
      } finally {
        try {
          await chrome.debugger.detach({ tabId });
        } catch (e) {
          console.warn('Error detaching debugger:', e);
        }
      }
    } catch (error) {
      console.error('Error in CDP keyboard operation:', error);
      return null;
    }
  }

  private async dispatchKeyCombinationCDP(tabId: number, combo: string) {
    const parts = combo.split('+').map((p) => p.trim());
    const modifiers = parts.slice(0, -1);
    const mainKey = parts[parts.length - 1];

    const modifierValue = this.getModifierBitmask(modifiers);

    // Press modifier keys
    for (const mod of modifiers) {
      const modInfo = this.getKeyInfo(mod);
      if (!modInfo) continue;
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: modInfo.key,
        code: modInfo.code,
        windowsVirtualKeyCode: modInfo.vk,
      });
    }

    const mainInfo = this.getKeyInfo(mainKey);
    if (mainInfo) {
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: mainInfo.key,
        code: mainInfo.code,
        windowsVirtualKeyCode: mainInfo.vk,
        modifiers: modifierValue,
      });
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: mainInfo.key,
        code: mainInfo.code,
        windowsVirtualKeyCode: mainInfo.vk,
        modifiers: modifierValue,
      });
    }

    // Release modifier keys
    for (const mod of [...modifiers].reverse()) {
      const modInfo = this.getKeyInfo(mod);
      if (!modInfo) continue;
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: modInfo.key,
        code: modInfo.code,
        windowsVirtualKeyCode: modInfo.vk,
      });
    }
  }

  private getModifierBitmask(modifiers: string[]): number {
    let mask = 0;
    for (const mod of modifiers) {
      const m = mod.toLowerCase();
      if (m === 'alt') mask |= 1;
      if (m === 'ctrl' || m === 'control') mask |= 2;
      if (m === 'meta' || m === 'cmd' || m === 'command') mask |= 4;
      if (m === 'shift') mask |= 8;
    }
    return mask;
  }

  private getKeyInfo(key: string): { key: string; code: string; vk: number } | null {
    const k = key.trim().toLowerCase();
    const special: Record<string, { key: string; code: string; vk: number }> = {
      pageup: { key: 'PageUp', code: 'PageUp', vk: 33 },
      pagedown: { key: 'PageDown', code: 'PageDown', vk: 34 },
      end: { key: 'End', code: 'End', vk: 35 },
      home: { key: 'Home', code: 'Home', vk: 36 },
      arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
      arrowup: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
      arrowright: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
      arrowdown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
      tab: { key: 'Tab', code: 'Tab', vk: 9 },
      enter: { key: 'Enter', code: 'Enter', vk: 13 },
      escape: { key: 'Escape', code: 'Escape', vk: 27 },
      esc: { key: 'Escape', code: 'Escape', vk: 27 },
      backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
      delete: { key: 'Delete', code: 'Delete', vk: 46 },
      insert: { key: 'Insert', code: 'Insert', vk: 45 },
      space: { key: ' ', code: 'Space', vk: 32 },
      ' ': { key: ' ', code: 'Space', vk: 32 },
      shift: { key: 'Shift', code: 'ShiftLeft', vk: 16 },
      ctrl: { key: 'Control', code: 'ControlLeft', vk: 17 },
      control: { key: 'Control', code: 'ControlLeft', vk: 17 },
      alt: { key: 'Alt', code: 'AltLeft', vk: 18 },
      meta: { key: 'Meta', code: 'MetaLeft', vk: 91 },
      cmd: { key: 'Meta', code: 'MetaLeft', vk: 91 },
      command: { key: 'Meta', code: 'MetaLeft', vk: 91 },
    };

    if (special[k]) return special[k];

    if (k.length === 1) {
      const upper = k.toUpperCase();
      const code =
        upper >= 'A' && upper <= 'Z'
          ? `Key${upper}`
          : upper >= '0' && upper <= '9'
            ? `Digit${upper}`
            : `Key${upper}`;
      return { key: upper, code, vk: upper.charCodeAt(0) };
    }

    return null;
  }
}

export const keyboardTool = new KeyboardTool();
