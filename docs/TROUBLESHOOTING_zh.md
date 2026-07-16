## 🚀 安装和连接问题

### 常见问题

#### 连接成功，但是服务启动失败

启动失败基本上都是**权限问题**或者用包管理工具安装的**node**导致的启动脚本找不到对应的node，核心排查流程

1. 先运行内置诊断命令

```bash
mcp-chrome-bridger doctor

# 检查指定浏览器
mcp-chrome-bridger doctor -b chrome

# 自动修复低风险问题：权限、logs 目录、node_path.txt
mcp-chrome-bridger doctor --fix
```

2. npm包全局安装后，确认清单文件com.chromemcp.nativehost.json的位置，里面有一个**path**字段，指向的是一个启动脚本:

2.1 **检查mcp-chrome-bridger是否安装成功**，确保是**全局安装**的

```bash
mcp-chrome-bridger -V
```

<img width="612" alt="截屏2025-06-11 15 09 57" src="https://github.com/user-attachments/assets/59458532-e6e1-457c-8c82-3756a5dbb28e" />

2.2 **检查清单文件是否已放在正确目录**

windows路径：C:\Users\xxx\AppData\Roaming\Google\Chrome\NativeMessagingHosts

mac路径： /Users/xxx/Library/Application\ Support/Google/Chrome/NativeMessagingHosts

Linux路径：~/.config/google-chrome/NativeMessagingHosts

如果 npm 包安装并注册正常的话，这个目录下会生成一个`com.chromemcp.nativehost.json`

> **注意：** 清单文件由 `mcp-chrome-bridger register` 创建。不要依赖安装时的 `postinstall` 自动执行：npm v12+ 和 pnpm 都可能默认跳过依赖包生命周期脚本，除非用户显式允许。安装后请执行：
>
> ```bash
> mcp-chrome-bridger register
> ```
>
> 如果你明确希望 npm 在安装时自动运行注册脚本，可以使用：`npm install -g --allow-scripts=mcp-chrome-bridger mcp-chrome-bridger`

```json
{
  "name": "com.chromemcp.nativehost",
  "description": "Node.js Host for Browser Bridge Extension",
  "path": "/Users/xxx/Library/pnpm/global/5/.pnpm/mcp-chrome-bridger@1.0.23/node_modules/mcp-chrome-bridger/dist/run_host.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://hbdgbgagpkpjffpklnamcljpakneikee/"]
}
```

> 如果发现没有此清单文件，可以尝试命令行执行：`mcp-chrome-bridger register`

3. Chrome浏览器会找到上面的清单文件指向的脚本路径来执行该脚本，同时会在/Users/xxx/Library/pnpm/global/5/.pnpm/mcp-chrome-bridger@1.0.23/node_modules/mcp-chrome-bridger/dist/（windows的自行查看清单文件对应的目录）下生成logs文件夹，里面会记录日志

具体要看你的安装路径（如果不清楚，可以打开上面提到的清单文件，里面的path就是安装目录），比如安装路径如下：看下日志的内容
C:\Users\admin\AppData\Local\nvm\v20.19.2\node_modules\mcp-chrome-bridger\dist\logs
<img width="804" alt="截屏2025-06-11 15 09 41" src="https://github.com/user-attachments/assets/ce7b7c94-7c84-409a-8210-c9317823aae1" />

4. 一般失败的原因就是两种

4.1. run_host.sh(windows是run_host.bat)没有执行权限：此时你可以自行赋予权限，参考：https://github.com/hangwin/mcp-chrome/issues/22#issuecomment-2990636930。 脚本路径在上述的清单文件可以查看

4.2. 脚本找不到node，因为你可能电脑上装了不同版本的node，脚本确认不了你把npm包装在哪个node底下了，不同的人可能用了不同的node版本管理工具，导致找不到，
参考：https://github.com/hangwin/mcp-chrome/issues/29#issuecomment-3003513940 （这个点目前正在优化中）

4.3 如果排除了以上两种原因都不行，则查看日志目录的日志，然后提issue

---

### 🐧 Linux 常见问题

#### 使用 `sudo` 安装导致的权限问题

在 Linux 上使用 `sudo npm install -g mcp-chrome-bridger` 时，包会安装到 `/usr/lib/node_modules/`（root 所有）。这会导致 native host 脚本运行时无法创建 `logs/` 目录而失败。

**方案一：修复 logs 目录权限**

```bash
sudo mkdir -p /usr/lib/node_modules/mcp-chrome-bridger/dist/logs
sudo chmod 777 /usr/lib/node_modules/mcp-chrome-bridger/dist/logs
```

**方案二（推荐）：配置 npm 用户目录安装**

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

然后无需 sudo 即可安装：

```bash
npm install -g mcp-chrome-bridger
mcp-chrome-bridger register
```

#### Linux 清单文件路径

`~/.config/google-chrome/NativeMessagingHosts/com.mcpchromeserver.nativehost.json`

#### 安装后必须完全重启 Chrome

执行 `mcp-chrome-bridger register` 后，必须完全退出并重新打开 Chrome（不是刷新页面），Native Messaging Host 才能被识别。

---

#### 工具执行超时

有可能长时间连接的时候session会超时，这个时候重新连接即可

#### 效果问题

不同的agent，不同的模型使用工具的效果是不一样的，这些都需要你自行尝试，我更推荐用聪明的agent，比如augment，claude code等等...
