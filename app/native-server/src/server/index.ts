import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import {
  NATIVE_SERVER_PORT,
  TIMEOUTS,
  SERVER_CONFIG,
  HTTP_STATUS,
  ERROR_MESSAGES,
} from '../constant';
import { NativeMessagingHost } from '../native-messaging-host';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer, registerServer, unregisterServer } from '../mcp/mcp-server';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { handleDynamicToolsUpdate } from '../mcp/register-tools';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';

const LOG_FILE = path.join(os.tmpdir(), 'mcp-chrome-native.log');
function logToFile(msg: string) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] [server] ${msg}\n`);
}

/**
 * Check if a port is already in use
 */
function isPortInUse(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, host);
  });
}

/**
 * Kill process using the specified port (cross-platform)
 */
async function killProcessOnPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    const platform = process.platform;

    let command: string;
    if (platform === 'win32') {
      // Windows: find PID and kill
      command = `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /PID %a /F`;
    } else {
      // macOS/Linux: use lsof
      command = `lsof -ti :${port} | xargs kill -9 2>/dev/null`;
    }

    exec(command, (error: any) => {
      // Wait a bit for the port to be released
      setTimeout(resolve, 500);
    });
  });
}

// Define request body type (if data needs to be retrieved from HTTP requests)
interface ExtensionRequestPayload {
  data?: any; // Data you want to pass to the extension
}

export class Server {
  private fastify: FastifyInstance;
  public isRunning = false; // Changed to public or provide a getter
  private nativeHost: NativeMessagingHost | null = null;
  private transportsMap: Map<string, StreamableHTTPServerTransport | SSEServerTransport> =
    new Map();
  // Map to track MCP server instances for each session (multi-client support)
  private mcpServersMap: Map<string, McpServer> = new Map();

  constructor() {
    this.fastify = Fastify({ logger: SERVER_CONFIG.LOGGER_ENABLED });

    // Add error handlers
    this.fastify.addHook('onError', (request, reply, error, done) => {
      logToFile(`Fastify onError: ${error.message}\n${error.stack}`);
      done();
    });

    this.fastify.setErrorHandler((error: Error, request, reply) => {
      logToFile(`Fastify errorHandler: ${error.message}\n${error.stack}`);
      reply.status(500).send({ error: error.message });
    });

    this.setupPlugins();
    this.setupRoutes();
  }
  /**
   * Associate NativeMessagingHost instance
   */
  public setNativeHost(nativeHost: NativeMessagingHost): void {
    this.nativeHost = nativeHost;
  }

  private async setupPlugins(): Promise<void> {
    await this.fastify.register(cors, {
      origin: SERVER_CONFIG.CORS_ORIGIN,
    });
  }

  private setupRoutes(): void {
    // for ping
    this.fastify.get(
      '/ask-extension',
      async (request: FastifyRequest<{ Body: ExtensionRequestPayload }>, reply: FastifyReply) => {
        if (!this.nativeHost) {
          return reply
            .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
            .send({ error: ERROR_MESSAGES.NATIVE_HOST_NOT_AVAILABLE });
        }
        if (!this.isRunning) {
          return reply
            .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
            .send({ error: ERROR_MESSAGES.SERVER_NOT_RUNNING });
        }

        try {
          // wait from extension message
          const extensionResponse = await this.nativeHost.sendRequestToExtensionAndWait(
            request.query,
            'process_data',
            TIMEOUTS.EXTENSION_REQUEST_TIMEOUT,
          );
          return reply.status(HTTP_STATUS.OK).send({ status: 'success', data: extensionResponse });
        } catch (error: any) {
          if (error.message.includes('timed out')) {
            return reply
              .status(HTTP_STATUS.GATEWAY_TIMEOUT)
              .send({ status: 'error', message: ERROR_MESSAGES.REQUEST_TIMEOUT });
          } else {
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
              status: 'error',
              message: `Failed to get response from extension: ${error.message}`,
            });
          }
        }
      },
    );

    // Compatible with SSE
    this.fastify.get('/sse', async (_, reply) => {
      try {
        // Set SSE headers
        reply.raw.writeHead(HTTP_STATUS.OK, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        // Create SSE transport
        const transport = new SSEServerTransport('/messages', reply.raw);
        this.transportsMap.set(transport.sessionId, transport);

        // Create new MCP server instance for this connection (multi-client support)
        const mcpServer = createMcpServer();
        this.mcpServersMap.set(transport.sessionId, mcpServer);
        registerServer(mcpServer);

        reply.raw.on('close', () => {
          this.transportsMap.delete(transport.sessionId);
          // Cleanup MCP server instance
          const server = this.mcpServersMap.get(transport.sessionId);
          if (server) {
            unregisterServer(server);
            this.mcpServersMap.delete(transport.sessionId);
          }
        });

        await mcpServer.connect(transport);

        // Keep connection open
        reply.raw.write(':\n\n');
      } catch (error) {
        if (!reply.sent) {
          reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
        }
      }
    });

    // Compatible with SSE
    this.fastify.post('/messages', async (req, reply) => {
      try {
        const { sessionId } = req.query as any;
        const transport = this.transportsMap.get(sessionId) as SSEServerTransport;
        if (!sessionId || !transport) {
          reply.code(HTTP_STATUS.BAD_REQUEST).send('No transport found for sessionId');
          return;
        }

        await transport.handlePostMessage(req.raw, reply.raw, req.body);
      } catch (error) {
        if (!reply.sent) {
          reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
        }
      }
    });

    // POST /mcp: Handle client-to-server messages
    this.fastify.post('/mcp', async (request, reply) => {
      logToFile(`[mcp] POST /mcp received`);
      const sessionId = request.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport | undefined = this.transportsMap.get(
        sessionId || '',
      ) as StreamableHTTPServerTransport;
      if (transport) {
        logToFile(`[mcp] Using existing transport for session ${sessionId}`);
        // transport found, do nothing
      } else if (!sessionId && isInitializeRequest(request.body)) {
        logToFile(`[mcp] Creating new transport (initialize request)`);
        const newSessionId = randomUUID(); // Generate session ID

        // Create new MCP server instance for this connection (multi-client support)
        const mcpServer = createMcpServer();

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId, // Use pre-generated ID
          onsessioninitialized: (initializedSessionId) => {
            logToFile(`[mcp] Session initialized: ${initializedSessionId}`);
            // Ensure transport instance exists and session ID matches
            if (transport && initializedSessionId === newSessionId) {
              this.transportsMap.set(initializedSessionId, transport);
              this.mcpServersMap.set(initializedSessionId, mcpServer);
              registerServer(mcpServer);
            }
          },
        });

        transport.onclose = () => {
          logToFile(`[mcp] Transport onclose called for session ${transport?.sessionId}`);
          if (transport?.sessionId) {
            this.transportsMap.delete(transport.sessionId);
            // Cleanup MCP server instance
            const server = this.mcpServersMap.get(transport.sessionId);
            if (server) {
              unregisterServer(server);
              this.mcpServersMap.delete(transport.sessionId);
            }
          }
        };
        await mcpServer.connect(transport);
        logToFile(`[mcp] MCP server connected to transport`);
      } else {
        logToFile(`[mcp] Invalid request - no session and not initialize`);
        reply.code(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_MCP_REQUEST });
        return;
      }

      try {
        logToFile(`[mcp] Handling request...`);
        await transport.handleRequest(request.raw, reply.raw, request.body);
        logToFile(`[mcp] Request handled successfully`);
        if (!reply.sent) {
          // Streamable HTTP keeps the raw response open and completes it later
          // when the MCP response is ready. Tell Fastify not to auto-finalize it.
          reply.hijack();
        }
      } catch (error: any) {
        logToFile(`[mcp] Error handling request: ${error.message}\n${error.stack}`);
        if (!reply.sent) {
          reply
            .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
            .send({ error: ERROR_MESSAGES.MCP_REQUEST_PROCESSING_ERROR });
        }
      }
    });

    this.fastify.get('/mcp', async (request, reply) => {
      const sessionId = request.headers['mcp-session-id'] as string | undefined;
      const transport = sessionId
        ? (this.transportsMap.get(sessionId) as StreamableHTTPServerTransport)
        : undefined;
      if (!transport) {
        reply.code(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_SSE_SESSION });
        return;
      }

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.flushHeaders(); // Ensure headers are sent immediately

      try {
        // transport.handleRequest will take over the response stream
        await transport.handleRequest(request.raw, reply.raw);
        if (!reply.sent) {
          // If transport didn't send anything (unlikely for SSE initial handshake)
          reply.hijack(); // Prevent Fastify from automatically sending response
        }
      } catch (error) {
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      }

      request.socket.on('close', () => {
        request.log.info(`SSE client disconnected for session: ${sessionId}`);
        // transport's onclose should handle its own cleanup
      });
    });

    this.fastify.delete('/mcp', async (request, reply) => {
      const sessionId = request.headers['mcp-session-id'] as string | undefined;
      const transport = sessionId
        ? (this.transportsMap.get(sessionId) as StreamableHTTPServerTransport)
        : undefined;

      if (!transport) {
        reply.code(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_SESSION_ID });
        return;
      }

      try {
        await transport.handleRequest(request.raw, reply.raw);
        // Assume transport.handleRequest will send response or transport.onclose will cleanup
        if (!reply.sent) {
          reply.code(HTTP_STATUS.NO_CONTENT).send();
        }
      } catch (error) {
        if (!reply.sent) {
          reply
            .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
            .send({ error: ERROR_MESSAGES.MCP_SESSION_DELETION_ERROR });
        }
      }
    });
  }

  public async start(port = NATIVE_SERVER_PORT, nativeHost: NativeMessagingHost): Promise<void> {
    if (!this.nativeHost) {
      this.nativeHost = nativeHost; // Ensure nativeHost is set
    } else if (this.nativeHost !== nativeHost) {
      this.nativeHost = nativeHost; // Update to the passed instance
    }

    if (this.isRunning) {
      logToFile('Server.start() called but already running');
      return;
    }

    // Check if port is already in use (another instance running)
    const portInUse = await isPortInUse(port, SERVER_CONFIG.HOST);
    if (portInUse) {
      logToFile(`Port ${port} already in use - killing old process and taking over`);
      await killProcessOnPort(port);
      logToFile(`Old process killed, proceeding with startup`);
    }

    try {
      // MCP servers are now created per-connection (multi-client support)
      logToFile('MCP multi-client support enabled');

      logToFile(`Starting Fastify on port ${port}...`);
      await this.fastify.listen({ port, host: SERVER_CONFIG.HOST });
      this.isRunning = true; // Update running status
      logToFile('Fastify started successfully');
      // No need to return, Promise resolves void by default
    } catch (err: any) {
      this.isRunning = false; // Startup failed, reset status
      logToFile(`Fastify start error: ${err.message}\n${err.stack}`);
      // Throw error instead of exiting directly, let caller (possibly NativeHost) handle
      throw err; // or return Promise.reject(err);
      // process.exit(1); // Not recommended to exit directly here
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    // this.nativeHost = null; // Not recommended to nullify here, association relationship may still be needed
    try {
      await this.fastify.close();
      this.isRunning = false; // Update running status
    } catch (err) {
      // Even if closing fails, mark as not running, but log the error
      this.isRunning = false;
      throw err; // Throw error
    }
  }

  public getInstance(): FastifyInstance {
    return this.fastify;
  }
}

const serverInstance = new Server();
export default serverInstance;
