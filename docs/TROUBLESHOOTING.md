# Installation and Connection Issues

## Connection Fails or Shows "Service Not Connected"

Start with the built-in diagnostic command:

```bash
mcp-chrome-bridger doctor
```

For a specific browser:

```bash
mcp-chrome-bridger doctor -b chrome
mcp-chrome-bridger doctor -b canary
mcp-chrome-bridger doctor -b chromium
mcp-chrome-bridger doctor -b chrome-for-testing
```

If `doctor` reports missing permissions, missing `logs/`, or missing `node_path.txt`, apply the low-risk automatic fixes:

```bash
mcp-chrome-bridger doctor --fix
```

If `doctor` reports a missing or stale manifest, register the native host again:

```bash
mcp-chrome-bridger register

# Or register for a specific browser
mcp-chrome-bridger register -b chrome
```

After registration, fully quit and reopen Chrome. Refreshing the extension page is not enough for Chrome to reload Native Messaging host manifests.

## Install-Time Scripts

The manifest is created by `mcp-chrome-bridger register`. Do not rely on install-time `postinstall` behavior: npm v12+ and pnpm can skip dependency lifecycle scripts unless scripts are explicitly allowed.

Recommended setup:

```bash
npm install -g mcp-chrome-bridger
mcp-chrome-bridger register
mcp-chrome-bridger doctor
```

If you intentionally want npm to run the install-time registration script:

```bash
npm install -g --allow-scripts=mcp-chrome-bridger mcp-chrome-bridger
```

## Native Host Logs

If `doctor` does not explain the issue, inspect the native host logs. The log directory is under the installed package's `dist/logs` directory. `doctor` prints the package path and manifest path to help you find it.

Example Windows path:

```text
C:\Users\admin\AppData\Local\nvm\v20.19.2\node_modules\mcp-chrome-bridger\dist\logs
```

Example macOS/Linux path:

```text
/usr/local/lib/node_modules/mcp-chrome-bridger/dist/logs
```

## Linux Troubleshooting

### Permission Issues When Installing With `sudo`

On Linux, if you install with `sudo npm install -g mcp-chrome-bridger`, the package may be installed under a root-owned global directory. This can prevent the native host from creating or writing to `dist/logs`.

Prefer installing global npm packages into a user-owned directory:

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Then install and register normally:

```bash
npm install -g mcp-chrome-bridger
mcp-chrome-bridger register
mcp-chrome-bridger doctor
```

If you must keep a root-owned global install, repair the logs directory permissions:

```bash
sudo mkdir -p /usr/lib/node_modules/mcp-chrome-bridger/dist/logs
sudo chmod 777 /usr/lib/node_modules/mcp-chrome-bridger/dist/logs
```

## Still Not Working?

Run `mcp-chrome-bridger doctor --json` and include the output, browser type, operating system, and recent native host logs when opening an issue.
