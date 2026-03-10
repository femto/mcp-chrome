import { stdin, stdout } from 'process';
import { Server } from './server';
import { v4 as uuidv4 } from 'uuid';
import { NativeMessageType } from 'mcp-chrome-shared';
import { TIMEOUTS } from './constant';
import fileHandler from './file-handler';
import { handleDynamicToolsUpdate } from './mcp/register-tools';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Get version from package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
let NATIVE_HOST_VERSION = '0.0.0';
try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  NATIVE_HOST_VERSION = packageJson.version || '0.0.0';
} catch {
  // Fallback if package.json cannot be read
}

// Simple file logger for debugging
const LOG_FILE = path.join(os.tmpdir(), 'mcp-chrome-native.log');
function logToFile(msg: string) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`);
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timeoutId: NodeJS.Timeout;
}

export class NativeMessagingHost {
  private associatedServer: Server | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private serverStarting: boolean = false; // Flag to prevent exit during server startup

  public setServer(serverInstance: Server): void {
    this.associatedServer = serverInstance;
  }

  // add message handler to wait for start server
  public start(): void {
    logToFile(`Native messaging host started. Log file: ${LOG_FILE}`);
    try {
      this.setupMessageHandling();
    } catch (error: any) {
      logToFile(`Failed to setup message handling: ${error.message}`);
      process.exit(1);
    }
  }

  private setupMessageHandling(): void {
    let buffer = Buffer.alloc(0);
    let expectedLength = -1;

    stdin.on('readable', () => {
      let chunk;
      while ((chunk = stdin.read()) !== null) {
        buffer = Buffer.concat([buffer, chunk]);

        if (expectedLength === -1 && buffer.length >= 4) {
          expectedLength = buffer.readUInt32LE(0);
          buffer = buffer.slice(4);
        }

        if (expectedLength !== -1 && buffer.length >= expectedLength) {
          const messageBuffer = buffer.slice(0, expectedLength);
          buffer = buffer.slice(expectedLength);

          try {
            const message = JSON.parse(messageBuffer.toString());
            this.handleMessage(message);
          } catch (error: any) {
            this.sendError(`Failed to parse message: ${error.message}`);
          }
          expectedLength = -1; // reset to get next data
        }
      }
    });

    stdin.on('end', () => {
      logToFile('stdin "end" event received - Chrome extension disconnected');
      this.cleanup();
    });

    stdin.on('error', (err) => {
      logToFile(`stdin "error" event received: ${err}`);
      this.cleanup();
    });
  }

  private async handleMessage(message: any): Promise<void> {
    logToFile(
      `Received message: type=${message?.type}, hasResponseId=${!!message?.responseToRequestId}`,
    );

    if (!message || typeof message !== 'object') {
      this.sendError('Invalid message format');
      return;
    }

    if (message.responseToRequestId) {
      const requestId = message.responseToRequestId;
      const pending = this.pendingRequests.get(requestId);

      if (pending) {
        clearTimeout(pending.timeoutId);
        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message.payload);
        }
        this.pendingRequests.delete(requestId);
      } else {
        // just ignore
      }
      return;
    }

    // Handle directive messages from Chrome
    try {
      switch (message.type) {
        case NativeMessageType.START:
          await this.startServer(message.payload?.port || 3000);
          break;
        case NativeMessageType.STOP:
          await this.stopServer();
          break;
        // Keep ping/pong for simple liveness detection, but this differs from request-response pattern
        case 'ping_from_extension':
          this.sendMessage({ type: 'pong_to_extension' });
          break;
        case 'file_operation':
          await this.handleFileOperation(message);
          break;
        case NativeMessageType.WEBMCP_TOOLS_UPDATE:
          // Handle WebMCP dynamic tools update from extension
          logToFile(`Received WEBMCP_TOOLS_UPDATE: ${JSON.stringify(message.payload)}`);
          try {
            handleDynamicToolsUpdate(message.payload);
            logToFile('Successfully handled WEBMCP_TOOLS_UPDATE');
          } catch (err: any) {
            logToFile(`Error handling WEBMCP_TOOLS_UPDATE: ${err.message}\n${err.stack}`);
          }
          logToFile(
            `After WEBMCP_TOOLS_UPDATE: serverStarting=${this.serverStarting}, isRunning=${this.associatedServer?.isRunning}`,
          );
          break;
        case NativeMessageType.GET_VERSION:
          // Return native host version
          logToFile(`Received GET_VERSION request, returning version: ${NATIVE_HOST_VERSION}`);
          this.sendMessage({
            type: NativeMessageType.VERSION_INFO,
            payload: { version: NATIVE_HOST_VERSION },
          });
          break;
        default:
          // Double check when message type is not supported
          if (!message.responseToRequestId) {
            this.sendError(
              `Unknown message type or non-response message: ${message.type || 'no type'}`,
            );
          }
      }
    } catch (error: any) {
      this.sendError(`Failed to handle directive message: ${error.message}`);
    }
  }

  /**
   * Handle file operations from the extension
   */
  private async handleFileOperation(message: any): Promise<void> {
    try {
      const result = await fileHandler.handleFileRequest(message.payload);

      if (message.requestId) {
        // Send response back with the request ID
        this.sendMessage({
          type: 'file_operation_response',
          responseToRequestId: message.requestId,
          payload: result,
        });
      } else {
        // No request ID, just send result
        this.sendMessage({
          type: 'file_operation_result',
          payload: result,
        });
      }
    } catch (error: any) {
      const errorResponse = {
        success: false,
        error: error.message || 'Unknown error during file operation',
      };

      if (message.requestId) {
        this.sendMessage({
          type: 'file_operation_response',
          responseToRequestId: message.requestId,
          error: errorResponse.error,
        });
      } else {
        this.sendError(`File operation failed: ${errorResponse.error}`);
      }
    }
  }

  /**
   * Send request to Chrome and wait for response
   * @param messagePayload Data to send to Chrome
   * @param timeoutMs Timeout for waiting response (milliseconds)
   * @returns Promise, resolves to Chrome's returned payload on success, rejects on failure
   */
  public sendRequestToExtensionAndWait(
    messagePayload: any,
    messageType: string = 'request_data',
    timeoutMs: number = TIMEOUTS.DEFAULT_REQUEST_TIMEOUT,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = uuidv4(); // Generate unique request ID

      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId); // Remove from Map after timeout
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Store request's resolve/reject functions and timeout ID
      this.pendingRequests.set(requestId, { resolve, reject, timeoutId });

      // Send message with requestId to Chrome
      this.sendMessage({
        type: messageType, // Define a request type, e.g. 'request_data'
        payload: messagePayload,
        requestId: requestId, // <--- Key: include request ID
      });
    });
  }

  /**
   * Start Fastify server (now accepts Server instance)
   */
  private async startServer(port: number): Promise<void> {
    if (!this.associatedServer) {
      this.sendError('Internal error: server instance not set');
      return;
    }
    try {
      if (this.associatedServer.isRunning) {
        this.sendMessage({
          type: NativeMessageType.ERROR,
          payload: { message: 'Server is already running' },
        });
        return;
      }

      this.serverStarting = true;
      logToFile(`Starting HTTP server on port ${port}...`);
      await this.associatedServer.start(port, this);
      this.serverStarting = false;
      logToFile(`HTTP server started successfully on port ${port}`);

      this.sendMessage({
        type: NativeMessageType.SERVER_STARTED,
        payload: { port },
      });
    } catch (error: any) {
      this.serverStarting = false;
      this.sendError(`Failed to start server: ${error.message}`);
    }
  }

  /**
   * Stop Fastify server
   */
  private async stopServer(): Promise<void> {
    if (!this.associatedServer) {
      this.sendError('Internal error: server instance not set');
      return;
    }
    try {
      // Check status through associatedServer
      if (!this.associatedServer.isRunning) {
        this.sendMessage({
          type: NativeMessageType.ERROR,
          payload: { message: 'Server is not running' },
        });
        return;
      }

      await this.associatedServer.stop();
      // this.serverStarted = false; // Server should update its own status after successful stop

      this.sendMessage({ type: NativeMessageType.SERVER_STOPPED }); // Distinguish from previous 'stopped'
    } catch (error: any) {
      this.sendError(`Failed to stop server: ${error.message}`);
    }
  }

  /**
   * Send message to Chrome extension
   */
  public sendMessage(message: any): void {
    try {
      const messageString = JSON.stringify(message);
      const messageBuffer = Buffer.from(messageString);
      const headerBuffer = Buffer.alloc(4);
      headerBuffer.writeUInt32LE(messageBuffer.length, 0);
      // Ensure atomic write
      stdout.write(Buffer.concat([headerBuffer, messageBuffer]), (err) => {
        if (err) {
          // Consider how to handle write failure, may affect request completion
        } else {
          // Message sent successfully, no action needed
        }
      });
    } catch (error: any) {
      // Catch JSON.stringify or Buffer operation errors
      // If preparation stage fails, associated request may never be sent
      // Need to consider whether to reject corresponding Promise (if called within sendRequestToExtensionAndWait)
    }
  }

  /**
   * Send error message to Chrome extension (mainly for sending non-request-response type errors)
   */
  private sendError(errorMessage: string): void {
    this.sendMessage({
      type: NativeMessageType.ERROR_FROM_NATIVE_HOST, // Use more explicit type
      payload: { message: errorMessage },
    });
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    logToFile('cleanup() called - shutting down native host');
    // Reject all pending requests
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Native host is shutting down or Chrome disconnected.'));
    });
    this.pendingRequests.clear();

    if (this.associatedServer && this.associatedServer.isRunning) {
      this.associatedServer
        .stop()
        .then(() => {
          process.exit(0);
        })
        .catch(() => {
          process.exit(1);
        });
    } else {
      process.exit(0);
    }
  }
}

const nativeMessagingHostInstance = new NativeMessagingHost();
export default nativeMessagingHostInstance;
