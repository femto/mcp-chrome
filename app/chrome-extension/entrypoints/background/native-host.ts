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

let nativePort: chrome.runtime.Port | null = null;
export const HOST_NAME = NATIVE_HOST.NAME;

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
 */
export function connectNativeHost(port: number = NATIVE_HOST.DEFAULT_PORT) {
  if (nativePort) {
    return;
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
      console.error(ERROR_MESSAGES.NATIVE_DISCONNECTED, chrome.runtime.lastError);
      nativePort = null;
    });

    nativePort.postMessage({ type: NativeMessageType.START, payload: { port } });
  } catch (error) {
    console.error(ERROR_MESSAGES.NATIVE_CONNECTION_FAILED, error);
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

  // Listen for messages from the internal message bus (for intra-background communication)
  onBusMessage('forward_to_native', (message: any) => {
    if (nativePort) {
      nativePort.postMessage(message);
      console.log('[NativeHost] Forwarded message via bus to native host:', message?.type);
    } else {
      console.log('[NativeHost] Cannot forward via bus - native host not connected');
    }
  });

  chrome.runtime.onStartup.addListener(connectNativeHost);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      message === NativeMessageType.CONNECT_NATIVE ||
      message.type === NativeMessageType.CONNECT_NATIVE
    ) {
      const port =
        typeof message === 'object' && message.port ? message.port : NATIVE_HOST.DEFAULT_PORT;
      connectNativeHost(port);
      sendResponse({ success: true, port });
      return true;
    }

    if (message.type === NativeMessageType.PING_NATIVE) {
      const connected = nativePort !== null;
      sendResponse({ connected });
      return true;
    }

    if (message.type === NativeMessageType.DISCONNECT_NATIVE) {
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
