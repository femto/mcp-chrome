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

export let mcpServer: Server | null = null;

export const getMcpServer = () => {
  if (mcpServer) {
    return mcpServer;
  }

  logToFile('Creating new MCP Server instance...');

  mcpServer = new Server(
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
  mcpServer.onerror = (error) => {
    logToFile(`MCP Server error: ${error}`);
  };

  setupTools(mcpServer);
  logToFile('MCP Server created and tools setup complete');
  return mcpServer;
};
