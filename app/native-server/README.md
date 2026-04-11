# MCP Chrome Native Host

This package provides the native messaging host used by the Chrome extension.

## Features

- Two-way communication with the extension through Chrome Native Messaging
- Multi-browser registration support for Chrome, Chrome Canary, Chromium, and explicit Chrome for Testing registration
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

### What `postinstall` Does

After a normal global install, `postinstall` will:

- ensure executable permissions for wrapper scripts and CLI files
- write the current Node.js path into `dist/node_path.txt`
- attempt user-level Native Messaging registration for detected browsers

Important notes:

- workspace/monorepo development installs skip auto-registration on purpose
- auto-detection currently covers Chrome, Canary, and Chromium
- Chrome for Testing is supported, but must be registered explicitly with `-b chrome-for-testing`

## Commands

Register for detected browsers:

```bash
mcp-chrome-bridger register --detect
```

Register for a specific browser:

```bash
# Chrome only
mcp-chrome-bridger register --browser chrome

# Chrome Canary only
mcp-chrome-bridger register --browser canary

# Chrome for Testing only
mcp-chrome-bridger register --browser chrome-for-testing

# Chromium only
mcp-chrome-bridger register --browser chromium

# Chrome + Canary + Chromium
mcp-chrome-bridger register --browser all
```

If your unpacked extension uses a non-default extension ID, append it to the native host whitelist during registration:

```bash
MCP_CHROME_EXTRA_EXTENSION_IDS=<extension-id> mcp-chrome-bridger register --browser canary
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

| Browser            | Linux | macOS | Windows |
| ------------------ | ----- | ----- | ------- |
| Google Chrome      | Yes   | Yes   | Yes     |
| Chrome Canary      | Yes   | Yes   | Yes     |
| Chrome for Testing | Yes\* | Yes\* | Yes\*   |
| Chromium           | Yes   | Yes   | Yes     |

\* Chrome for Testing registration is explicit only. It is not included in auto-detection or `--browser all`.

User-level manifest locations:

- Chrome
  - Linux: `~/.config/google-chrome/NativeMessagingHosts/`
  - macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
  - Windows: `%APPDATA%\Google\Chrome\NativeMessagingHosts\`
- Canary
  - Linux: `~/.config/google-chrome-canary/NativeMessagingHosts/`
  - macOS: `~/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts/`
  - Windows: `%LOCALAPPDATA%\Google\Chrome SxS\NativeMessagingHosts\`
- Chrome for Testing
  - Linux: `~/.config/google-chrome-for-testing/NativeMessagingHosts/`
  - macOS: `~/Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts/`
  - Windows: `%LOCALAPPDATA%\Google\Chrome for Testing\User Data\NativeMessagingHosts\`
- Chromium
  - Linux: `~/.config/chromium/NativeMessagingHosts/`
  - macOS: `~/Library/Application Support/Chromium/NativeMessagingHosts/`
  - Windows: `%APPDATA%\Chromium\NativeMessagingHosts\`

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
