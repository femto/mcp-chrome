# MCP Chrome Native Host Installation Guide

This document explains how the native host is installed and registered.

## Overview

The native host is distributed as the npm package `mcp-chrome-bridger`.

```text
npm install -g mcp-chrome-bridger
└─ postinstall
   ├─ ensures executable permissions
   ├─ attempts user-level registration
   └─ if that fails, instructs the user to run:
      mcp-chrome-bridger register --system
```

In the common case, a global install is enough.

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
```

After installation, the package attempts user-level native messaging registration automatically.

## Registration

### User-Level Registration

Run this if you want to register manually:

```bash
mcp-chrome-bridger register
```

This writes manifest files into the current user's native messaging directories.

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

- Windows: `%APPDATA%\Google\Chrome\NativeMessagingHosts\`
- macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
- Linux: `~/.config/google-chrome/NativeMessagingHosts/`

### System Level

- Windows: `%ProgramFiles%\Google\Chrome\NativeMessagingHosts\`
- macOS: `/Library/Google/Chrome/NativeMessagingHosts/`
- Linux: `/etc/opt/chrome/native-messaging-hosts/`

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

## Wrapper Files

The build output includes both naming schemes:

- `mcp-chrome-server-host.sh`
- `mcp-chrome-server-host.bat`
- `run_host.sh`
- `run_host.bat`

`run_host.*` is kept as a compatibility artifact. It does not need to be renamed in source.

## Verification

After installation, verify the setup with these checks:

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
