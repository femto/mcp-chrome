#!/usr/bin/env node
import serverInstance from './server';
import nativeMessagingHostInstance from './native-messaging-host';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LOG_FILE = path.join(os.tmpdir(), 'mcp-chrome-native.log');
function logToFile(msg: string) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] [index] ${msg}\n`);
}

try {
  serverInstance.setNativeHost(nativeMessagingHostInstance); // Server needs setNativeHost method
  nativeMessagingHostInstance.setServer(serverInstance); // NativeHost needs setServer method
  nativeMessagingHostInstance.start();
} catch (error) {
  logToFile(`Startup error: ${error}`);
  process.exit(1);
}

process.on('error', (error) => {
  logToFile(`Process error event: ${error}`);
  process.exit(1);
});

// Handle process signals and uncaught exceptions
process.on('SIGINT', () => {
  logToFile('Received SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logToFile('Received SIGTERM');
  process.exit(0);
});

process.on('exit', (code) => {
  logToFile(`Process exiting with code: ${code}`);
});

process.on('uncaughtException', (error) => {
  logToFile(`Uncaught exception: ${error}\n${error.stack}`);
  // Don't exit - try to keep server alive
});

process.on('unhandledRejection', (reason: any) => {
  logToFile(`Unhandled rejection: ${reason}\n${reason?.stack || ''}`);
  // Don't exit immediately, let the program continue running
});

// Keep-alive: prevent Node.js from exiting when event loop is empty
// This is needed because stdin closing might cause Node to think there's nothing to do
const keepAliveInterval = setInterval(() => {
  // Keep the process alive - this interval is ref'd by default
  // Log periodically to confirm process is still running
  logToFile(`[keep-alive] isRunning=${serverInstance.isRunning}, pid=${process.pid}`);
}, 30000); // Every 30 seconds

// Ensure the interval keeps the process alive
keepAliveInterval.ref();

// Also add a shorter interval for debugging
setInterval(() => {
  // Short keep-alive for debugging
}, 5000).ref();

// Log when beforeExit is triggered (event loop is empty)
process.on('beforeExit', (code) => {
  logToFile(`[beforeExit] Event loop empty, code=${code}`);
});
