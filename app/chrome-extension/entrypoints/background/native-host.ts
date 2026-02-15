import { NativeMessageType } from 'chrome-mcp-shared';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import {
  NATIVE_HOST,
  ICONS,
  NOTIFICATIONS,
  STORAGE_KEYS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/common/constants';
import { handleCallTool } from './tools';
import { on as onBusMessage } from './native-message-bus';
import { resendAllToolsToNative } from '@/webmcp/webmcp-manager';

let nativePort: chrome.runtime.Port | null = null;
export const HOST_NAME = NATIVE_HOST.NAME;

const LOG_PREFIX = '[NativeHost]';

// Auto-connect state
let autoConnectEnabled = true;
let autoConnectLoaded = false;
let ensurePromise: Promise<boolean> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000; // 1 second

/**
 * Server status management interface
 */
interface ServerStatus {
  isRunning: boolean;
  port?: number;
  lastUpdated: number;
}

let currentServerStatus: ServerStatus = {
  isRunning: false,
  lastUpdated: Date.now(),
};

/**
 * Save server status to chrome.storage
 */
async function saveServerStatus(status: ServerStatus): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.SERVER_STATUS]: status });
  } catch (error) {
    console.error(ERROR_MESSAGES.SERVER_STATUS_SAVE_FAILED, error);
  }
}

/**
 * Load server status from chrome.storage
 */
async function loadServerStatus(): Promise<ServerStatus> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.SERVER_STATUS]);
    if (result[STORAGE_KEYS.SERVER_STATUS]) {
      return result[STORAGE_KEYS.SERVER_STATUS];
    }
  } catch (error) {
    console.error(ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED, error);
  }
  return {
    isRunning: false,
    lastUpdated: Date.now(),
  };
}

/**
 * Load auto-connect preference from storage
 */
async function loadAutoConnectEnabled(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.AUTO_CONNECT_ENABLED]);
    // Default to true if not set
    return result[STORAGE_KEYS.AUTO_CONNECT_ENABLED] !== false;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to load auto-connect setting:`, error);
    return true; // Default to enabled
  }
}

/**
 * Save auto-connect preference to storage
 */
async function saveAutoConnectEnabled(enabled: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.AUTO_CONNECT_ENABLED]: enabled });
    autoConnectEnabled = enabled;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save auto-connect setting:`, error);
  }
}

/**
 * Get preferred port from storage or use default
 */
async function getPreferredPort(portOverride?: unknown): Promise<number> {
  if (typeof portOverride === 'number' && portOverride > 0) {
    return portOverride;
  }
  const status = await loadServerStatus();
  return status.port ?? NATIVE_HOST.DEFAULT_PORT;
}

/**
 * Schedule reconnection with exponential backoff
 */
function scheduleReconnect(trigger: string): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log(`${LOG_PREFIX} Max reconnect attempts reached, giving up (trigger=${trigger})`);
    return;
  }

  const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
  reconnectAttempts++;

  console.log(
    `${LOG_PREFIX} Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts}, trigger=${trigger})`,
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void ensureNativeConnected(`reconnect:${trigger}`).catch(() => {});
  }, delay);
}

/**
 * Clear reconnection state
 */
function clearReconnectState(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
}

/**
 * Ensure native host is connected (with concurrency protection)
 */
async function ensureNativeConnected(trigger: string, portOverride?: unknown): Promise<boolean> {
  // Concurrency protection: only one ensure flow at a time
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    // Load auto-connect setting if not yet loaded
    if (!autoConnectLoaded) {
      autoConnectEnabled = await loadAutoConnectEnabled();
      autoConnectLoaded = true;
    }

    // If auto-connect is disabled, do nothing
    if (!autoConnectEnabled) {
      console.log(`${LOG_PREFIX} Auto-connect disabled, skipping ensure (trigger=${trigger})`);
      return false;
    }

    // Already connected
    if (nativePort) {
      console.log(`${LOG_PREFIX} Already connected (trigger=${trigger})`);
      return true;
    }

    const port = await getPreferredPort(portOverride);
    console.log(`${LOG_PREFIX} Attempting connection on port ${port} (trigger=${trigger})`);

    const ok = connectNativeHost(port);
    if (!ok) {
      scheduleReconnect(trigger);
      return false;
    }

    clearReconnectState();
    return true;
  })().finally(() => {
    ensurePromise = null;
  });

  return ensurePromise;
}

/**
 * Broadcast server status change to all listeners
 */
function broadcastServerStatusChange(status: ServerStatus): void {
  chrome.runtime
    .sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.SERVER_STATUS_CHANGED,
      payload: status,
    })
    .catch(() => {
      // Ignore errors if no listeners are present
    });
}

/**
 * Connect to the native messaging host
 * @returns true if connection initiated successfully, false otherwise
 */
export function connectNativeHost(port: number = NATIVE_HOST.DEFAULT_PORT): boolean {
  if (nativePort) {
    return true; // Already connected
  }

  try {
    nativePort = chrome.runtime.connectNative(HOST_NAME);

    nativePort.onMessage.addListener(async (message) => {
      // chrome.notifications.create({
      //   type: NOTIFICATIONS.TYPE,
      //   iconUrl: chrome.runtime.getURL(ICONS.NOTIFICATION),
      //   title: 'Message from native host',
      //   message: `Received data from host: ${JSON.stringify(message)}`,
      //   priority: NOTIFICATIONS.PRIORITY,
      // });

      if (message.type === NativeMessageType.PROCESS_DATA && message.requestId) {
        const requestId = message.requestId;
        const requestPayload = message.payload;

        nativePort?.postMessage({
          responseToRequestId: requestId,
          payload: {
            status: 'success',
            message: SUCCESS_MESSAGES.TOOL_EXECUTED,
            data: requestPayload,
          },
        });
      } else if (message.type === NativeMessageType.CALL_TOOL && message.requestId) {
        const requestId = message.requestId;
        try {
          const result = await handleCallTool(message.payload);
          nativePort?.postMessage({
            responseToRequestId: requestId,
            payload: {
              status: 'success',
              message: SUCCESS_MESSAGES.TOOL_EXECUTED,
              data: result,
            },
          });
        } catch (error) {
          nativePort?.postMessage({
            responseToRequestId: requestId,
            payload: {
              status: 'error',
              message: ERROR_MESSAGES.TOOL_EXECUTION_FAILED,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      } else if (message.type === NativeMessageType.SERVER_STARTED) {
        const port = message.payload?.port;
        currentServerStatus = {
          isRunning: true,
          port: port,
          lastUpdated: Date.now(),
        };
        await saveServerStatus(currentServerStatus);
        broadcastServerStatusChange(currentServerStatus);
        console.log(`${SUCCESS_MESSAGES.SERVER_STARTED} on port ${port}`);

        // Resend all registered WebMCP tools to native server
        // This ensures tools are available after server restart
        resendAllToolsToNative();
      } else if (message.type === NativeMessageType.SERVER_STOPPED) {
        currentServerStatus = {
          isRunning: false,
          port: currentServerStatus.port, // Keep last known port for reconnection
          lastUpdated: Date.now(),
        };
        await saveServerStatus(currentServerStatus);
        broadcastServerStatusChange(currentServerStatus);
        console.log(SUCCESS_MESSAGES.SERVER_STOPPED);
      } else if (message.type === NativeMessageType.ERROR_FROM_NATIVE_HOST) {
        console.error('Error from native host:', message.payload?.message || 'Unknown error');
      } else if (message.type === 'file_operation_response') {
        // Forward file operation response back to the requesting tool
        chrome.runtime.sendMessage(message).catch(() => {
          // Ignore if no listeners
        });
      }
    });

    nativePort.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      console.error(`${LOG_PREFIX} Disconnected!`, {
        error: error?.message || 'no error',
        timestamp: new Date().toISOString(),
      });
      nativePort = null;

      // Update server status
      currentServerStatus = {
        isRunning: false,
        port: currentServerStatus.port,
        lastUpdated: Date.now(),
      };
      void saveServerStatus(currentServerStatus);
      broadcastServerStatusChange(currentServerStatus);

      // Schedule reconnection if auto-connect is enabled
      if (autoConnectEnabled) {
        scheduleReconnect('disconnect');
      }
    });

    nativePort.postMessage({ type: NativeMessageType.START, payload: { port } });
    return true;
  } catch (error) {
    console.error(ERROR_MESSAGES.NATIVE_CONNECTION_FAILED, error);
    return false;
  }
}

/**
 * Initialize native host listeners and load initial state
 */
export const initNativeHostListener = () => {
  // Initialize server status from storage
  loadServerStatus()
    .then((status) => {
      currentServerStatus = status;
    })
    .catch((error) => {
      console.error(ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED, error);
    });

  // Auto-connect on SW activation (covers SW restart after idle)
  void ensureNativeConnected('sw_startup').catch(() => {});

  // Listen for messages from the internal message bus (for intra-background communication)
  onBusMessage('forward_to_native', (message: any) => {
    console.log(`${LOG_PREFIX} Received bus message, nativePort exists:`, !!nativePort);
    if (nativePort) {
      try {
        nativePort.postMessage(message);
        console.log(`${LOG_PREFIX} Successfully posted message to native host:`, message?.type);
      } catch (err) {
        console.error(`${LOG_PREFIX} Error posting message:`, err);
      }
    } else {
      console.log(`${LOG_PREFIX} Cannot forward via bus - native host not connected`);
    }
  });

  // Auto-connect on Chrome browser startup
  chrome.runtime.onStartup.addListener(() => {
    void ensureNativeConnected('onStartup').catch(() => {});
  });

  // Auto-connect on extension install/update
  chrome.runtime.onInstalled.addListener(() => {
    void ensureNativeConnected('onInstalled').catch(() => {});
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      message === NativeMessageType.CONNECT_NATIVE ||
      message.type === NativeMessageType.CONNECT_NATIVE
    ) {
      const port =
        typeof message === 'object' && message.port ? message.port : NATIVE_HOST.DEFAULT_PORT;

      // Enable auto-connect when user manually connects
      void saveAutoConnectEnabled(true);
      clearReconnectState();

      ensureNativeConnected('user_connect', port)
        .then((ok) => {
          sendResponse({ success: ok, port });
        })
        .catch(() => {
          sendResponse({ success: false, port });
        });
      return true;
    }

    if (message.type === NativeMessageType.PING_NATIVE) {
      const connected = nativePort !== null;
      sendResponse({ connected });
      return true;
    }

    if (message.type === NativeMessageType.DISCONNECT_NATIVE) {
      // Disable auto-connect when user manually disconnects
      void saveAutoConnectEnabled(false);
      clearReconnectState();

      if (nativePort) {
        nativePort.disconnect();
        nativePort = null;
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No active connection' });
      }
      return true;
    }

    if (message.type === BACKGROUND_MESSAGE_TYPES.GET_SERVER_STATUS) {
      sendResponse({
        success: true,
        serverStatus: currentServerStatus,
        connected: nativePort !== null,
      });
      return true;
    }

    if (message.type === BACKGROUND_MESSAGE_TYPES.REFRESH_SERVER_STATUS) {
      loadServerStatus()
        .then((storedStatus) => {
          currentServerStatus = storedStatus;
          sendResponse({
            success: true,
            serverStatus: currentServerStatus,
            connected: nativePort !== null,
          });
        })
        .catch((error) => {
          console.error(ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED, error);
          sendResponse({
            success: false,
            error: ERROR_MESSAGES.SERVER_STATUS_LOAD_FAILED,
            serverStatus: currentServerStatus,
            connected: nativePort !== null,
          });
        });
      return true;
    }

    // Forward file operation messages to native host
    if (message.type === 'forward_to_native' && message.message) {
      if (nativePort) {
        nativePort.postMessage(message.message);
        console.log('[NativeHost] Forwarded message to native host:', message.message?.type);
        sendResponse({ success: true });
      } else {
        console.log('[NativeHost] Cannot forward - native host not connected');
        sendResponse({ success: false, error: 'Native host not connected' });
      }
      return true;
    }
  });
};
