# 安装和连接问题

## 连接失败或显示 “Service Not Connected”

先运行内置诊断命令：

```bash
mcp-chrome-bridger doctor
```

检查指定浏览器：

```bash
mcp-chrome-bridger doctor -b chrome
mcp-chrome-bridger doctor -b canary
mcp-chrome-bridger doctor -b chromium
mcp-chrome-bridger doctor -b chrome-for-testing
```

如果 `doctor` 提示权限、`logs/` 目录或 `node_path.txt` 问题，可以运行低风险自动修复：

```bash
mcp-chrome-bridger doctor --fix
```

如果 `doctor` 提示 manifest 缺失或路径过期，重新注册 native host：

```bash
mcp-chrome-bridger register

# 或只注册指定浏览器
mcp-chrome-bridger register -b chrome
```

注册后必须完全退出并重新打开 Chrome。只刷新扩展页面不会让 Chrome 重新加载 Native Messaging host manifest。

## 安装脚本说明

manifest 由 `mcp-chrome-bridger register` 创建。不要依赖安装时的 `postinstall` 自动执行：npm v12+ 和 pnpm 都可能默认跳过依赖包生命周期脚本，除非用户显式允许。

推荐安装方式：

```bash
npm install -g mcp-chrome-bridger
mcp-chrome-bridger register
mcp-chrome-bridger doctor
```

如果你明确希望 npm 在安装时自动运行注册脚本：

```bash
npm install -g --allow-scripts=mcp-chrome-bridger mcp-chrome-bridger
```

## Native Host 日志

如果 `doctor` 仍然无法解释问题，请查看 native host 日志。日志目录位于已安装包的 `dist/logs` 目录下。`doctor` 会输出 package path 和 manifest path，方便你定位。

Windows 示例路径：

```text
C:\Users\admin\AppData\Local\nvm\v20.19.2\node_modules\mcp-chrome-bridger\dist\logs
```

macOS/Linux 示例路径：

```text
/usr/local/lib/node_modules/mcp-chrome-bridger/dist/logs
```

## Linux 常见问题

### 使用 `sudo` 安装导致的权限问题

在 Linux 上使用 `sudo npm install -g mcp-chrome-bridger` 时，包可能会安装到 root 拥有的全局目录，导致 native host 无法创建或写入 `dist/logs`。

更推荐把 npm 全局包安装到用户目录：

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

然后正常安装和注册：

```bash
npm install -g mcp-chrome-bridger
mcp-chrome-bridger register
mcp-chrome-bridger doctor
```

如果必须继续使用 root 拥有的全局安装，可以修复 logs 目录权限：

```bash
sudo mkdir -p /usr/lib/node_modules/mcp-chrome-bridger/dist/logs
sudo chmod 777 /usr/lib/node_modules/mcp-chrome-bridger/dist/logs
```

## 仍然无法解决？

请运行 `mcp-chrome-bridger doctor --json`，并在提 issue 时附上输出、浏览器类型、操作系统和最近的 native host 日志。
