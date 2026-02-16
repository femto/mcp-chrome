# windows 安装指南 🔧

Chrome MCP Server 在windows电脑的详细安装和配置步骤

## 📋 安装

1. **从github上下载最新的chrome扩展**

下载地址：https://github.com/femto/mcp-chrome/releases

2. **全局安装mcp-chrome-bridger**

确保电脑上已经安装了node，如果没安装请自行先安装

```bash
# 确保安装的是最新版本的npm包(当前最新版本是1.0.14)，否则可能有问题
npm install -g mcp-chrome-bridger
```

3. **加载 Chrome 扩展**

   - 打开 Chrome 并访问 `chrome://extensions/`
   - 启用"开发者模式"
   - 点击"加载已解压的扩展程序"，选择 `your/dowloaded/extension/folder`
   - 点击插件图标打开插件，点击连接即可看到mcp的配置
     <img width="475" alt="截屏2025-06-09 15 52 06" src="https://github.com/user-attachments/assets/241e57b8-c55f-41a4-9188-0367293dc5bc" />

4. **在 CherryStudio 中使用**

类型选streamableHttp，url填http://127.0.0.1:12306/mcp

<img width="675" alt="截屏2025-06-11 15 00 29" src="https://github.com/user-attachments/assets/6631e9e4-57f9-477e-b708-6a285cc0d881" />

查看工具列表，如果能列出工具，说明已经可以使用了

<img width="672" alt="截屏2025-06-11 15 14 55" src="https://github.com/user-attachments/assets/d08b7e51-3466-4ab7-87fa-3f1d7be9d112" />

```json
{
  "mcpServers": {
    "streamable-mcp-server": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:12306/mcp"
    }
  }
}
```

## 🚀 安装和连接问题

### 点击扩展的连接按钮后如果没连接成功

1. **检查mcp-chrome-bridger是否安装成功**，确保是全局安装的

```bash
mcp-chrome-bridger -V
```

<img width="612" alt="截屏2025-06-11 15 09 57" src="https://github.com/user-attachments/assets/59458532-e6e1-457c-8c82-3756a5dbb28e" />

2. **检查清单文件是否已放在正确目录**

路径：C:\Users\xxx\AppData\Roaming\Google\Chrome\NativeMessagingHosts

3. **检查npm包的安装目录下是否有日志**

具体要看你的安装路径（如果不清楚，可以打开第2步的清单文件，里面的path就是安装目录），比如安装路径如下：看下日志的内容
C:\Users\admin\AppData\Local\nvm\v20.19.2\node_modules\mcp-chrome-bridger\dist\logs
<img width="804" alt="截屏2025-06-11 15 09 41" src="https://github.com/user-attachments/assets/ce7b7c94-7c84-409a-8210-c9317823aae1" />
