# 🚀 Installation and Connection Issues

### If Connection Fails After Clicking the Connect Button on the Extension

1. **Run the built-in diagnostic command**

```bash
mcp-chrome-bridger doctor

# Check a specific browser
mcp-chrome-bridger doctor -b chrome

# Apply low-risk fixes for permissions, logs directory, and node_path.txt
mcp-chrome-bridger doctor --fix
```

2. **Check if mcp-chrome-bridger is installed successfully**, ensure it's globally installed

```bash
mcp-chrome-bridger -V
```

<img width="612" alt="Screenshot 2025-06-11 15 09 57" src="https://github.com/user-attachments/assets/59458532-e6e1-457c-8c82-3756a5dbb28e" />

3. **Check if the manifest file is in the correct directory**

Windows path: C:\Users\xxx\AppData\Roaming\Google\Chrome\NativeMessagingHosts

Mac path: /Users/xxx/Library/Application\ Support/Google/Chrome/NativeMessagingHosts

Linux path: ~/.config/google-chrome/NativeMessagingHosts

If the npm package is installed correctly, a file named `com.chromemcp.nativehost.json` should be generated in this directory.

> **Note:** The manifest file is created by `mcp-chrome-bridger register`, which runs automatically as a postinstall script during `npm install -g`. However, if you use **pnpm**, postinstall scripts are disabled by default (pnpm v7+). In that case, you need to manually run:
>
> ```bash
> mcp-chrome-bridger register
> ```
>
> Alternatively, enable scripts before installing: `pnpm config set enable-pre-post-scripts true`

4. **Check if there are logs in the npm package installation directory**
   You need to check your installation path (if unclear, open the manifest file in step 2, the path field shows the installation directory). For example, if the installation path is as follows, check the log contents:

C:\Users\admin\AppData\Local\nvm\v20.19.2\node_modules\mcp-chrome-bridger\dist\logs

<img width="804" alt="Screenshot 2025-06-11 15 09 41" src="https://github.com/user-attachments/assets/ce7b7c94-7c84-409a-8210-c9317823aae1" />

5. **Check if you have execution permissions**
   You need to check your installation path (if unclear, open the manifest file in step 2, the path field shows the installation directory). For example, if the Mac installation path is as follows:

`xxx/node_modules/mcp-chrome-bridger/dist/run_host.sh`

Check if this script has execution permissions

---

## 🐧 Linux Troubleshooting

### Permission issues when installing with `sudo`

On Linux, if you install with `sudo npm install -g mcp-chrome-bridger`, the package is installed to `/usr/lib/node_modules/` which is owned by root. This causes the native host script to fail because it cannot create its `logs/` directory at runtime.

**Fix Option 1: Fix permissions on the logs directory**

```bash
sudo mkdir -p /usr/lib/node_modules/mcp-chrome-bridger/dist/logs
sudo chmod 777 /usr/lib/node_modules/mcp-chrome-bridger/dist/logs
```

**Fix Option 2 (Recommended): Install npm packages to user directory**

Configure npm to install global packages without sudo:

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Then install normally without sudo:

```bash
npm install -g mcp-chrome-bridger
mcp-chrome-bridger register
```

### Native Messaging Host path

Linux path for the manifest file:

`~/.config/google-chrome/NativeMessagingHosts/com.mcpchromeserver.nativehost.json`

### Chrome must be fully restarted

After running `mcp-chrome-bridger register`, you must fully quit and reopen Chrome (not just refresh the tab) for the native messaging host to be recognized.
