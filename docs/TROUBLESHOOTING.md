# 🚀 Installation and Connection Issues

### If Connection Fails After Clicking the Connect Button on the Extension

1. **Check if mcp-chrome-bridger is installed successfully**, ensure it's globally installed

```bash
mcp-chrome-bridger -V
```

<img width="612" alt="Screenshot 2025-06-11 15 09 57" src="https://github.com/user-attachments/assets/59458532-e6e1-457c-8c82-3756a5dbb28e" />

2. **Check if the manifest file is in the correct directory**

Windows path: C:\Users\xxx\AppData\Roaming\Google\Chrome\NativeMessagingHosts

Mac path: /Users/xxx/Library/Application\ Support/Google/Chrome/NativeMessagingHosts

If the npm package is installed correctly, a file named `com.chromemcp.nativehost.json` should be generated in this directory

3. **Check if there are logs in the npm package installation directory**
   You need to check your installation path (if unclear, open the manifest file in step 2, the path field shows the installation directory). For example, if the installation path is as follows, check the log contents:

C:\Users\admin\AppData\Local\nvm\v20.19.2\node_modules\mcp-chrome-bridger\dist\logs

<img width="804" alt="Screenshot 2025-06-11 15 09 41" src="https://github.com/user-attachments/assets/ce7b7c94-7c84-409a-8210-c9317823aae1" />

4. **Check if you have execution permissions**
   You need to check your installation path (if unclear, open the manifest file in step 2, the path field shows the installation directory). For example, if the Mac installation path is as follows:

`xxx/node_modules/mcp-chrome-bridger/dist/run_host.sh`

Check if this script has execution permissions
