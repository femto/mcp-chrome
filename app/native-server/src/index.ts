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
  serverInstance.setNativeHost(nativeMessagingHostInstance);
  nativeMessagingHostInstance.setServer(serverInstance);
  nativeMessagingHostInstance.start();
} catch (error) {
  logToFile(`Startup error: ${error}`);
  process.exit(1);
}

process.on('error', (error) => {
  logToFile(`Process error event: ${error}`);
  process.exit(1);
});

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
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  logToFile(`Unhandled rejection: ${reason}\n${reason?.stack || ''}`);
  // Don't exit immediately, let the program continue running
});
