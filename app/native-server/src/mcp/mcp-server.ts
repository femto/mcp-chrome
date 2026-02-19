import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { setupTools } from './register-tools';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LOG_FILE = path.join(os.tmpdir(), 'mcp-chrome-native.log');
function logToFile(msg: string) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] [mcp-server] ${msg}\n`);
}

// Track all active MCP server instances for multi-client support
const activeServers: Set<Server> = new Set();

/**
 * Create a new MCP Server instance (factory function for multi-client support)
 */
export function createMcpServer(): Server {
  logToFile('Creating new MCP Server instance...');

  const server = new Server(
    {
      name: 'ChromeMcpServer',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {
          listChanged: true, // Enable dynamic tool updates
        },
      },
    },
  );

  // Add error handler
  server.onerror = (error) => {
    logToFile(`MCP Server error: ${error}`);
  };

  setupTools(server);
  logToFile('MCP Server created and tools setup complete');

  return server;
}

/**
 * Register a server instance as active
 */
export function registerServer(server: Server): void {
  activeServers.add(server);
  logToFile(`Server registered. Active servers: ${activeServers.size}`);
}

/**
 * Unregister a server instance when connection closes
 */
export function unregisterServer(server: Server): void {
  activeServers.delete(server);
  logToFile(`Server unregistered. Active servers: ${activeServers.size}`);
}

/**
 * Get all active server instances (for sending notifications)
 */
export function getActiveServers(): Set<Server> {
  return activeServers;
}

/**
 * Get the count of active servers
 */
export function getActiveServerCount(): number {
  return activeServers.size;
}
