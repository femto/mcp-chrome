# MCP Chrome Native Host Installation Guide

This document explains how the native host is installed and registered.

## Overview

The native host is distributed as the npm package `mcp-chrome-bridger`.

```text
npm install -g mcp-chrome-bridger
mcp-chrome-bridger register
└─ registration
   ├─ ensures executable permissions
   ├─ writes the current Node.js path used by wrapper scripts
   └─ writes user-level native messaging manifests
```

Do not rely on install-time `postinstall` behavior. npm v12+ and pnpm can skip dependency lifecycle scripts unless the user explicitly allows them. The `postinstall` script is kept as a convenience path for environments that allow scripts, but explicit registration is the supported setup path.

Notes:

- workspace/monorepo installs intentionally skip auto-registration
- registration currently targets detected Chrome, Canary, and Chromium installs
- Chrome for Testing support is explicit only via `-b chrome-for-testing`

## Package Name vs Host Name

These are different things:

- npm package name: `mcp-chrome-bridger`
- CLI command: `mcp-chrome-bridger`
- new native host name: `com.mcpchromeserver.nativehost`
- legacy native host name: `com.chromemcp.nativehost`

The package name stays unchanged to avoid breaking existing installs.

## Installation

Install globally:

```bash
npm install -g mcp-chrome-bridger
mcp-chrome-bridger register
mcp-chrome-bridger doctor
```

If you intentionally want npm to run the install-time registration script, allow it explicitly:

```bash
npm install -g --allow-scripts=mcp-chrome-bridger mcp-chrome-bridger
```

## Registration

### User-Level Registration

Run this if you want to register manually:

```bash
mcp-chrome-bridger register
```

This writes manifest files into the current user's native messaging directories.

Explicit browser targets:

```bash
# Chrome only
mcp-chrome-bridger register -b chrome

# Chrome Canary only
mcp-chrome-bridger register -b canary

# Chrome for Testing only
mcp-chrome-bridger register -b chrome-for-testing

# Chromium only
mcp-chrome-bridger register -b chromium

# Chrome + Canary + Chromium
mcp-chrome-bridger register -b all
```

If your unpacked extension uses a non-default extension ID, add it during registration:

```bash
MCP_CHROME_EXTRA_EXTENSION_IDS=<extension-id> mcp-chrome-bridger register -f -b canary
```

### System-Level Registration

If user-level registration fails, use system-level registration:

```bash
mcp-chrome-bridger register --system
```

On macOS or Linux, you can also run:

```bash
sudo mcp-chrome-bridger register
```

On Windows, run the command from an Administrator shell.

## Manifest Locations

### User Level

- Chrome
  - Windows: `%APPDATA%\Google\Chrome\NativeMessagingHosts\`
  - macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
  - Linux: `~/.config/google-chrome/NativeMessagingHosts/`
- Canary
  - Windows: `%LOCALAPPDATA%\Google\Chrome SxS\NativeMessagingHosts\`
  - macOS: `~/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts/`
  - Linux: `~/.config/google-chrome-canary/NativeMessagingHosts/`
- Chrome for Testing
  - Windows: `%LOCALAPPDATA%\Google\Chrome for Testing\User Data\NativeMessagingHosts\`
  - macOS: `~/Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts/`
  - Linux: `~/.config/google-chrome-for-testing/NativeMessagingHosts/`
- Chromium
  - Windows: `%APPDATA%\Chromium\NativeMessagingHosts\`
  - macOS: `~/Library/Application Support/Chromium/NativeMessagingHosts/`
  - Linux: `~/.config/chromium/NativeMessagingHosts/`

### System Level

- Chrome
  - Windows: `%ProgramFiles%\Google\Chrome\NativeMessagingHosts\`
  - macOS: `/Library/Google/Chrome/NativeMessagingHosts/`
  - Linux: `/etc/opt/chrome/native-messaging-hosts/`
- Canary
  - Windows: `%ProgramFiles(x86)%\Google\Chrome SxS\NativeMessagingHosts\`
  - macOS: `/Library/Google/Chrome Canary/NativeMessagingHosts/`
  - Linux: `/etc/opt/chrome-canary/native-messaging-hosts/`
- Chrome for Testing
  - Windows: `%ProgramFiles%\Google\Chrome for Testing\NativeMessagingHosts\`
  - macOS: `/Library/Google/Chrome for Testing/NativeMessagingHosts/`
  - Linux: `/etc/opt/chrome-for-testing/native-messaging-hosts/`
- Chromium
  - Windows: `%ProgramFiles%\Chromium\NativeMessagingHosts\`
  - macOS: `/Library/Application Support/Chromium/NativeMessagingHosts/`
  - Linux: `/etc/chromium/native-messaging-hosts/`

## What Gets Registered

The installer writes manifests for both host names:

- `com.mcpchromeserver.nativehost`
- `com.chromemcp.nativehost`

That keeps new builds compatible with older extension configurations.

## Manifest Structure

A generated manifest looks like this conceptually:

```json
{
  "name": "com.mcpchromeserver.nativehost",
  "description": "Node.js Host for Browser Bridge Extension",
  "path": "/path/to/mcp-chrome-server-host.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<extension-id>/"]
}
```

Notes:

- The `path` points to a wrapper script, not directly to `node`
- Build output includes both the new wrapper name and the legacy wrapper name
- The wrapper script launches the compiled Node.js entrypoint
- `allowed_origins` includes the built-in local ID, the web store ID, and any IDs supplied through `MCP_CHROME_EXTRA_EXTENSION_IDS`

## Wrapper Files

The build output includes both naming schemes:

- `mcp-chrome-server-host.sh`
- `mcp-chrome-server-host.bat`
- `run_host.sh`
- `run_host.bat`

`run_host.*` is kept as a compatibility artifact. It does not need to be renamed in source.

## Verification

After installation, start with the built-in diagnostic command:

```bash
mcp-chrome-bridger doctor

# Check a specific browser
mcp-chrome-bridger doctor -b chrome

# Print machine-readable output
mcp-chrome-bridger doctor --json
```

If the diagnostic reports permissions, missing logs directory, or a missing `node_path.txt`, apply low-risk fixes:

```bash
mcp-chrome-bridger doctor --fix
```

You can also verify the setup manually with these checks:

1. Confirm the manifest file exists in the expected directory.
2. Confirm the Chrome extension is installed with `nativeMessaging` permission.
3. Try connecting from the extension.
4. If needed, inspect extension logs and native host logs.

## Troubleshooting

### Permission Issues

If the extension cannot launch the native host, repair permissions:

```bash
mcp-chrome-bridger fix-permissions
```

If you need to inspect the global install path:

```bash
npm list -g mcp-chrome-bridger
```

With pnpm:

```bash
pnpm list -g mcp-chrome-bridger
```

On macOS or Linux, if needed, you can repair permissions manually:

```bash
chmod +x /path/to/node_modules/mcp-chrome-bridger/dist/mcp-chrome-server-host.sh
chmod +x /path/to/node_modules/mcp-chrome-bridger/dist/index.js
chmod +x /path/to/node_modules/mcp-chrome-bridger/dist/cli.js
```

### Windows Notes

- `.bat` files usually do not need execute permissions
- make sure the wrapper file is not marked read-only
- if required, retry from an Administrator shell

### Reinstall

If registration still fails, reinstall the package:

```bash
npm uninstall -g mcp-chrome-bridger
npm install -g mcp-chrome-bridger
```

Then run:

```bash
mcp-chrome-bridger fix-permissions
mcp-chrome-bridger register
```

## Support Information

If you file an issue, include:

- operating system and version
- Node.js version
- install command used
- registration command used
- error output
- steps already tried
