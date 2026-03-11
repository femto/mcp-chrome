# MCP Chrome Native Host

This package provides the native messaging host used by the Chrome extension.

## Features

- Two-way communication with the extension through Chrome Native Messaging
- Multi-browser registration support for Chrome and Chromium on Linux, macOS, and Windows
- Local HTTP service used by the extension and MCP clients
- TypeScript implementation
- Native host registration and permission repair commands

## Prerequisites

- Node.js 14+
- npm 6+

## Development

Build and register the native host locally:

```bash
cd app/native-server
npm run dev
```

Start the extension in development mode:

```bash
cd app/chrome-extension
npm run dev
```

Build the native host:

```bash
npm run build
```

## Installation

Install the npm package globally:

```bash
npm install -g mcp-chrome-bridger
```

This package name stays `mcp-chrome-bridger`.

## Commands

Register for detected browsers:

```bash
mcp-chrome-bridger register --detect
```

Register for a specific browser:

```bash
# Chrome only
mcp-chrome-bridger register --browser chrome

# Chromium only
mcp-chrome-bridger register --browser chromium

# Both Chrome and Chromium
mcp-chrome-bridger register --browser all
```

System-level registration:

```bash
mcp-chrome-bridger register --system
```

Repair file permissions:

```bash
mcp-chrome-bridger fix-permissions
```

## Browser Support

| Browser       | Linux | macOS | Windows |
| ------------- | ----- | ----- | ------- |
| Google Chrome | Yes   | Yes   | Yes     |
| Chromium      | Yes   | Yes   | Yes     |

User-level manifest locations:

- Linux: `~/.config/[browser-name]/NativeMessagingHosts/`
- macOS: `~/Library/Application Support/[Browser]/NativeMessagingHosts/`
- Windows: `%APPDATA%\[Browser]\NativeMessagingHosts\`

## Compatibility

The native host keeps compatibility in two places:

- Native host package name remains `mcp-chrome-bridger`
- Native messaging host registration writes both the new and legacy host names
- Build output contains both wrapper script names:
  - `mcp-chrome-server-host.sh` / `.bat`
  - `run_host.sh` / `.bat`

The extension will try the new host name first and fall back to the legacy host name if needed.

## Extension Integration Example

```javascript
let nativePort = null;
let serverRunning = false;

function startServer() {
  if (nativePort) {
    console.log('Already connected to the native host');
    return;
  }

  try {
    nativePort = chrome.runtime.connectNative('com.mcpchromeserver.nativehost');

    nativePort.onMessage.addListener((message) => {
      console.log('Received native message:', message);

      if (message.type === 'started') {
        serverRunning = true;
        console.log(`Server started on port ${message.payload.port}`);
      } else if (message.type === 'stopped') {
        serverRunning = false;
        console.log('Server stopped');
      } else if (message.type === 'error') {
        console.error('Native host error:', message.payload.message);
      }
    });

    nativePort.onDisconnect.addListener(() => {
      console.log('Native host disconnected:', chrome.runtime.lastError);
      nativePort = null;
      serverRunning = false;
    });

    nativePort.postMessage({ type: 'start', payload: { port: 3000 } });
  } catch (error) {
    console.error('Failed to start native messaging:', error);
  }
}

function stopServer() {
  if (nativePort && serverRunning) {
    nativePort.postMessage({ type: 'stop' });
  }
}

async function testPing() {
  try {
    const response = await fetch('http://localhost:3000/ping');
    return await response.json();
  } catch (error) {
    console.error('Ping failed:', error);
    return null;
  }
}
```

## Testing

```bash
npm run test
```

## License

MIT
