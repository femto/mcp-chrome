# Chrome MCP Server 🚀

[![Stars](https://img.shields.io/github/stars/hangwin/mcp-chrome)](https://img.shields.io/github/stars/hangwin/mcp-chrome)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue.svg)](https://www.typescriptlang.org/)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://developer.chrome.com/docs/extensions/)
[![Release](https://img.shields.io/github/v/release/hangwin/mcp-chrome.svg)](https://img.shields.io/github/v/release/hangwin/mcp-chrome.svg)


> 🌟 **Turn your Chrome browser into your intelligent assistant** - Let AI take control of your browser, transforming it into a powerful AI-controlled automation tool.

**📖 Documentation**: [English](README.md) | [中文](README_zh.md)

> The project is still in its early stages and is under intensive development. More features, stability improvements, and other enhancements will follow.

---

## 🎯 What is Chrome MCP Server?

Chrome MCP Server is a Chrome extension-based **Model Context Protocol (MCP) server** that exposes your Chrome browser functionality to AI assistants like Claude, enabling complex browser automation, content analysis, and semantic search. Unlike traditional browser automation tools (like Playwright), **Chrome MCP Server** directly uses your daily Chrome browser, leveraging existing user habits, configurations, and login states, allowing various large models or chatbots to take control of your browser and truly become your everyday assistant.

## ✨ Core Features

- 😁 **Chatbot/Model Agnostic**: Let any LLM or chatbot client or agent you prefer automate your browser
- ⭐️ **Use Your Original Browser**: Seamlessly integrate with your existing browser environment (your configurations, login states, etc.)
- 💻 **Fully Local**: Pure local MCP server ensuring user privacy
- 🚄 **Streamable HTTP**: Streamable HTTP connection method
- 🏎 **Cross-Tab**: Cross-tab context
- 🧠 **Semantic Search**: Built-in vector database for intelligent browser tab content discovery
- 🔍 **Smart Content Analysis**: AI-powered text extraction and similarity matching
- 🌐 **20+ Tools**: Support for screenshots, network monitoring, interactive operations, bookmark management, browsing history, and 20+ other tools
- 🚀 **SIMD-Accelerated AI**: Custom WebAssembly SIMD optimization for 4-8x faster vector operations

## 🆚 Comparison with Similar Projects

| Comparison Dimension    | Playwright-based MCP Server                                                                                               | Chrome Extension-based MCP Server                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Resource Usage**      | ❌ Requires launching independent browser process, installing Playwright dependencies, downloading browser binaries, etc. | ✅ No need to launch independent browser process, directly utilizes user's already open Chrome browser |
| **User Session Reuse**  | ❌ Requires re-login                                                                                                      | ✅ Automatically uses existing login state                                                             |
| **Browser Environment** | ❌ Clean environment lacks user settings                                                                                  | ✅ Fully preserves user environment                                                                    |
| **API Access**          | ⚠️ Limited to Playwright API                                                                                              | ✅ Full access to Chrome native APIs                                                                   |
| **Startup Speed**       | ❌ Requires launching browser process                                                                                     | ✅ Only needs to activate extension                                                                    |
| **Response Speed**      | 50-200ms inter-process communication                                                                                      | ✅ Faster                                                                                              |

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.19.0 and pnpm/npm
- Chrome/Chromium browser

### Installation Steps

1. **Download the latest Chrome extension from GitHub**

Download link: https://github.com/hangwin/mcp-chrome/releases

2. **Install mcp-chrome-bridge globally**

npm

```bash
npm install -g mcp-chrome-bridge
```

pnpm

```bash
# Method 1: Enable scripts globally (recommended)
pnpm config set enable-pre-post-scripts true
pnpm install -g mcp-chrome-bridge

# Method 2: Manual registration (if postinstall doesn't run)
pnpm install -g mcp-chrome-bridge
mcp-chrome-bridge register
```

> Note: pnpm v7+ disables postinstall scripts by default for security. The `enable-pre-post-scripts` setting controls whether pre/post install scripts run. If automatic registration fails, use the manual registration command above.

3. **Load Chrome Extension**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select `your/dowloaded/extension/folder`
   - Click the extension icon to open the plugin, then click connect to see the MCP configuration
     <img width="475" alt="Screenshot 2025-06-09 15 52 06" src="https://github.com/user-attachments/assets/241e57b8-c55f-41a4-9188-0367293dc5bc" />

### Usage with MCP Protocol Clients

#### Using Streamable HTTP Connection (👍🏻 Recommended)

Add the following configuration to your MCP client configuration (using CherryStudio as an example):

> Streamable HTTP connection method is recommended

```json
{
  "mcpServers": {
    "chrome-mcp-server": {
      "type": "streamableHttp",
      "url": "http://127.0.0.1:12306/mcp"
    }
  }
}
```

#### Using STDIO Connection (Alternative)

If your client only supports stdio connection method, please use the following approach:

1. First, check the installation location of the npm package you just installed

```sh
# npm check method
npm list -g mcp-chrome-bridge
# pnpm check method
pnpm list -g mcp-chrome-bridge
```

Assuming the command above outputs the path: /Users/xxx/Library/pnpm/global/5
Then your final path would be: /Users/xxx/Library/pnpm/global/5/node_modules/mcp-chrome-bridge/dist/mcp/mcp-server-stdio.js

2. Replace the configuration below with the final path you just obtained

```json
{
  "mcpServers": {
    "chrome-mcp-stdio": {
      "command": "npx",
      "args": [
        "node",
        "/Users/xxx/Library/pnpm/global/5/node_modules/mcp-chrome-bridge/dist/mcp/mcp-server-stdio.js"
      ]
    }
  }
}
```

eg：config in augment:

<img width="494" alt="截屏2025-06-22 22 11 25" src="https://github.com/user-attachments/assets/48eefc0c-a257-4d3b-8bbe-d7ff716de2bf" />

## 🛠️ Available Tools

Complete tool list: [Complete Tool List](docs/TOOLS.md)

<details>
<summary><strong>📊 Browser Management (6 tools)</strong></summary>

- `get_windows_and_tabs` - List all browser windows and tabs
- `chrome_navigate` - Navigate to URLs and control viewport
- `chrome_switch_tab` - Switch the current active tab
- `chrome_close_tabs` - Close specific tabs or windows
- `chrome_go_back_or_forward` - Browser navigation control
- `chrome_inject_script` - Inject content scripts into web pages
- `chrome_send_command_to_inject_script` - Send commands to injected content scripts
</details>

<details>
<summary><strong>📸 Screenshots & Visual (1 tool)</strong></summary>

- `chrome_screenshot` - Advanced screenshot capture with element targeting, full-page support, and custom dimensions
</details>

<details>
<summary><strong>🌐 Network Monitoring (4 tools)</strong></summary>

- `chrome_network_capture_start/stop` - webRequest API network capture
- `chrome_network_debugger_start/stop` - Debugger API with response bodies
- `chrome_network_request` - Send custom HTTP requests
</details>

<details>
<summary><strong>🔍 Content Analysis (4 tools)</strong></summary>

- `search_tabs_content` - AI-powered semantic search across browser tabs
- `chrome_get_web_content` - Extract HTML/text content from pages
- `chrome_get_interactive_elements` - Find clickable elements
- `chrome_console` - Capture and retrieve console output from browser tabs
</details>

<details>
<summary><strong>🎯 Interaction (3 tools)</strong></summary>

- `chrome_click_element` - Click elements using CSS selectors
- `chrome_fill_or_select` - Fill forms and select options
- `chrome_keyboard` - Simulate keyboard input and shortcuts
</details>

<details>
<summary><strong>📚 Data Management (5 tools)</strong></summary>

- `chrome_history` - Search browser history with time filters
- `chrome_bookmark_search` - Find bookmarks by keywords
- `chrome_bookmark_add` - Add new bookmarks with folder support
- `chrome_bookmark_delete` - Delete bookmarks
</details>

## 🧪 Usage Examples

### AI helps you summarize webpage content and automatically control Excalidraw for drawing

prompt: [excalidraw-prompt](prompt/excalidraw-prompt.md)
Instruction: Help me summarize the current page content, then draw a diagram to aid my understanding.
https://www.youtube.com/watch?v=3fBPdUBWVz0

https://github.com/user-attachments/assets/fd17209b-303d-48db-9e5e-3717141df183

### After analyzing the content of the image, the LLM automatically controls Excalidraw to replicate the image

prompt: [excalidraw-prompt](prompt/excalidraw-prompt.md)|[content-analize](prompt/content-analize.md)
Instruction: First, analyze the content of the image, and then replicate the image by combining the analysis with the content of the image.
https://www.youtube.com/watch?v=tEPdHZBzbZk

https://github.com/user-attachments/assets/60d12b1a-9b74-40f4-994c-95e8fa1fc8d3

### AI automatically injects scripts and modifies webpage styles

prompt: [modify-web-prompt](prompt/modify-web.md)
Instruction: Help me modify the current page's style and remove advertisements.
https://youtu.be/twI6apRKHsk

https://github.com/user-attachments/assets/69cb561c-2e1e-4665-9411-4a3185f9643e

### AI automatically captures network requests for you

query: I want to know what the search API for Xiaohongshu is and what the response structure looks like

https://youtu.be/1hHKr7XKqnQ

https://github.com/user-attachments/assets/dc7e5cab-b9af-4b9a-97ce-18e4837318d9

### AI helps analyze your browsing history

query: Analyze my browsing history from the past month

https://youtu.be/jf2UZfrR2Vk

https://github.com/user-attachments/assets/31b2e064-88c6-4adb-96d7-50748b826eae

### Web page conversation

query: Translate and summarize the current web page
https://youtu.be/FlJKS9UQyC8

https://github.com/user-attachments/assets/aa8ef2a1-2310-47e6-897a-769d85489396

### AI automatically takes screenshots for you (web page screenshots)

query: Take a screenshot of Hugging Face's homepage
https://youtu.be/7ycK6iksWi4

https://github.com/user-attachments/assets/65c6eee2-6366-493d-a3bd-2b27529ff5b3

### AI automatically takes screenshots for you (element screenshots)

query: Capture the icon from Hugging Face's homepage
https://youtu.be/ev8VivANIrk

https://github.com/user-attachments/assets/d0cf9785-c2fe-4729-a3c5-7f2b8b96fe0c

### AI helps manage bookmarks

query: Add the current page to bookmarks and put it in an appropriate folder

https://youtu.be/R_83arKmFTo

https://github.com/user-attachments/assets/15a7d04c-0196-4b40-84c2-bafb5c26dfe0

### Automatically close web pages

query: Close all shadcn-related web pages

https://youtu.be/2wzUT6eNVg4

https://github.com/user-attachments/assets/83de4008-bb7e-494d-9b0f-98325cfea592

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](docs/CONTRIBUTING.md) for detailed guidelines.

## 🚧 Future Roadmap

We have exciting plans for the future development of Chrome MCP Server:

- [ ] Authentication
- [ ] Recording and Playback
- [ ] Workflow Automation
- [ ] Enhanced Browser Support (Firefox Extension)

---

**Want to contribute to any of these features?** Check out our [Contributing Guide](docs/CONTRIBUTING.md) and join our development community!

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📚 More Documentation

- [Architecture Design](docs/ARCHITECTURE.md) - Detailed technical architecture documentation
- [TOOLS API](docs/TOOLS.md) - Complete tool API documentation
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issue solutions

based on https://github.com/hangwin/mcp-chrome and fixed a few bugs.
