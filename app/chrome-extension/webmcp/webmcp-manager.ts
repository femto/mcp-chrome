/**
 * WebMCP Manager
 * 管理动态网站工具的注册和执行
 */

import { siteToolsConfig, matchSiteConfig, SiteConfig, SiteTool } from './site-tools-config';
import { NativeMessageType } from 'chrome-mcp-shared';

// Worldbook API 配置
const WORLDBOOK_API_URL = 'https://worldbook.it.com/api/webmcp';

// Debounce timeout for native server notification
let notifyNativeTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Send WebMCP tools update to native server
 */
function notifyNativeServerToolsUpdate(
  action: 'register' | 'unregister',
  tabId: number,
  siteName?: string,
  tools?: SiteTool[],
) {
  // Debounce to prevent rapid fire
  if (notifyNativeTimeout) {
    clearTimeout(notifyNativeTimeout);
  }

  notifyNativeTimeout = setTimeout(() => {
    const payload: any = { action, tabId };

    if (action === 'register' && siteName && tools) {
      payload.siteName = siteName;
      payload.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        params: t.params,
      }));
    }

    // Send message to background script which forwards to native host
    chrome.runtime
      .sendMessage({
        type: 'forward_to_native',
        message: {
          type: NativeMessageType.WEBMCP_TOOLS_UPDATE,
          payload,
        },
      })
      .then(() => {
        console.log(`[WebMCP] Sent tools update to native server: ${action}`);
      })
      .catch((err) => {
        console.log(
          '[WebMCP] Failed to send tools update (native host may not be connected):',
          err,
        );
      });
  }, 300);
}

// API 响应类型 (snake_case)
interface ApiToolParam {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

interface ApiTool {
  name: string;
  description: string;
  params: ApiToolParam[];
  handler: string;
}

interface ApiSiteConfig {
  url_pattern: string;
  site_name: string;
  tools: ApiTool[];
}

// 存储当前已注册的网站工具
const registeredSiteTools = new Map<number, SiteConfig>();

// 事件名称
const WEBMCP_EVENTS = {
  EXECUTE_TOOL: 'webmcp:execute-tool',
  TOOL_RESULT: 'webmcp:tool-result',
  REGISTER_TOOLS: 'webmcp:register-tools',
};

/**
 * 将 API 响应转换为本地 SiteConfig 格式
 */
function convertApiConfig(apiConfig: ApiSiteConfig): SiteConfig {
  return {
    urlPattern: new RegExp(apiConfig.url_pattern),
    siteName: apiConfig.site_name,
    tools: apiConfig.tools.map((t) => ({
      name: t.name,
      description: t.description,
      params: t.params.map((p) => ({
        name: p.name,
        type: p.type as 'string' | 'number' | 'boolean' | 'object' | 'array',
        description: p.description,
        required: p.required,
      })),
      handler: t.handler,
    })),
  };
}

/**
 * 从 Worldbook API 获取匹配的站点配置
 */
async function fetchSiteConfigFromAPI(url: string): Promise<SiteConfig | null> {
  try {
    const response = await fetch(`${WORLDBOOK_API_URL}/match?url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      console.log(`[WebMCP] API request failed: ${response.status}`);
      return null;
    }
    const data = await response.json();
    if (!data) return null;
    return convertApiConfig(data as ApiSiteConfig);
  } catch (error) {
    console.log(`[WebMCP] Failed to fetch from API, falling back to local config:`, error);
    return null;
  }
}

/**
 * 获取站点配置 - 优先从 API 获取，失败时使用本地配置
 */
async function getSiteConfig(url: string): Promise<SiteConfig | null> {
  // 首先尝试从 Worldbook API 获取
  const apiConfig = await fetchSiteConfigFromAPI(url);
  if (apiConfig) {
    console.log(`[WebMCP] 从 Worldbook API 获取配置: ${apiConfig.siteName}`);
    return apiConfig;
  }

  // 如果 API 失败，使用本地配置作为后备
  const localConfig = matchSiteConfig(url);
  if (localConfig) {
    console.log(`[WebMCP] 使用本地配置: ${localConfig.siteName}`);
  }
  return localConfig;
}

/**
 * 初始化 WebMCP 监听器
 */
export function initWebMCPListener() {
  // 监听标签页更新，自动检测并注册工具
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
      // Check if we need to unregister old tools (URL changed to non-matching site)
      const oldConfig = registeredSiteTools.get(tabId);

      const siteConfig = await getSiteConfig(tab.url);
      if (siteConfig) {
        // Only register if not already registered for this site
        if (!oldConfig || oldConfig.siteName !== siteConfig.siteName) {
          console.log(`[WebMCP] 检测到匹配的网站: ${siteConfig.siteName} (${tab.url})`);
          await registerSiteTools(tabId, siteConfig);

          // Notify native server about new tools
          notifyNativeServerToolsUpdate('register', tabId, siteConfig.siteName, siteConfig.tools);
        }
      } else if (oldConfig) {
        // URL changed to non-matching site, unregister old tools
        console.log(`[WebMCP] 标签页 ${tabId} 导航离开 ${oldConfig.siteName}，清理工具`);
        registeredSiteTools.delete(tabId);
        notifyNativeServerToolsUpdate('unregister', tabId);
      }
    }
  });

  // 监听标签页关闭，清理工具
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (registeredSiteTools.has(tabId)) {
      console.log(`[WebMCP] 标签页 ${tabId} 关闭，清理工具`);
      registeredSiteTools.delete(tabId);
      notifyNativeServerToolsUpdate('unregister', tabId);
    }
  });

  // 监听消息请求（用于调试和测试）
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.type === 'webmcp:detect-tools') {
      detectAndRegisterTools()
        .then((result) => sendResponse({ success: true, result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true; // 保持端口打开用于异步响应
    }
    if (request.type === 'webmcp:call-tool') {
      const { tabId, toolName, params } = request;
      executeWebMCPTool(tabId, toolName, params || {})
        .then((result) => sendResponse({ success: true, ...result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }
    if (request.type === 'webmcp:list-tools') {
      const allTools = getAllRegisteredTools();
      const result: any[] = [];
      allTools.forEach((config, tid) => {
        result.push({
          tabId: tid,
          siteName: config.siteName,
          tools: config.tools.map((t) => t.name),
        });
      });
      sendResponse({ success: true, registeredTools: result });
      return true;
    }
  });

  console.log('[WebMCP] Manager initialized');
}

/**
 * 为标签页注册网站工具
 */
async function registerSiteTools(tabId: number, siteConfig: SiteConfig) {
  try {
    // 注入 WebMCP 执行脚本
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectWebMCPExecutor,
      args: [siteConfig.tools.map((t) => ({ name: t.name, handler: t.handler }))],
      world: 'MAIN',
    });

    // 注入桥接脚本用于通信
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectWebMCPBridge,
      world: 'ISOLATED',
    });

    registeredSiteTools.set(tabId, siteConfig);
    console.log(`[WebMCP] 已为标签页 ${tabId} 注册 ${siteConfig.tools.length} 个工具`);
  } catch (error) {
    console.error(`[WebMCP] 注册工具失败:`, error);
  }
}

/**
 * 注入到 MAIN world 的执行器
 */
function injectWebMCPExecutor(tools: Array<{ name: string; handler: string }>) {
  // 防止重复注入
  if ((window as any).__WEBMCP_EXECUTOR_LOADED__) return;
  (window as any).__WEBMCP_EXECUTOR_LOADED__ = true;

  // 存储工具处理函数
  const toolHandlers = new Map<string, (...args: unknown[]) => unknown>();

  // 编译工具处理函数
  tools.forEach((tool) => {
    try {
      const handler = eval(`(${tool.handler})`);
      toolHandlers.set(tool.name, handler);
      console.log(`[WebMCP] 注册工具: ${tool.name}`);
    } catch (e) {
      console.error(`[WebMCP] 编译工具 ${tool.name} 失败:`, e);
    }
  });

  // 监听工具执行请求 (通过 postMessage 从 ISOLATED world)
  // 注意：不能使用 async/await，因为 esbuild 会转换成 __async helper，在 MAIN world 中不存在
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'webmcp:execute-tool') return;

    const { requestId, toolName, params } = event.data;
    console.log(`[WebMCP] 执行工具: ${toolName}`, params);

    const handler = toolHandlers.get(toolName);
    if (!handler) {
      window.postMessage(
        {
          type: 'webmcp:tool-result',
          requestId,
          result: null,
          error: `工具 ${toolName} 未找到`,
        },
        '*',
      );
      return;
    }

    // 使用 Promise.resolve 包装结果，支持同步和异步 handler
    Promise.resolve()
      .then(() => handler(params))
      .then((result) => {
        window.postMessage(
          {
            type: 'webmcp:tool-result',
            requestId,
            result,
            error: null,
          },
          '*',
        );
      })
      .catch((error) => {
        window.postMessage(
          {
            type: 'webmcp:tool-result',
            requestId,
            result: null,
            error: error.message || String(error),
          },
          '*',
        );
      });
  });

  console.log('[WebMCP] Executor initialized with', toolHandlers.size, 'tools');
}

/**
 * 注入到 ISOLATED world 的桥接脚本
 */
function injectWebMCPBridge() {
  if ((window as any).__WEBMCP_BRIDGE_LOADED__) return;
  (window as any).__WEBMCP_BRIDGE_LOADED__ = true;

  const pendingRequests = new Map<string, (response: any) => void>();

  // 监听来自 background 的消息
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.type === 'webmcp:call-tool') {
      const requestId = `req-${Date.now()}-${Math.random()}`;
      pendingRequests.set(requestId, sendResponse);

      // 通过 postMessage 转发到 MAIN world
      window.postMessage(
        {
          type: 'webmcp:execute-tool',
          requestId,
          toolName: request.toolName,
          params: request.params,
        },
        '*',
      );

      return true; // 异步响应
    }
  });

  // 监听来自 MAIN world 的结果 (通过 postMessage)
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'webmcp:tool-result') return;

    const { requestId, result, error } = event.data;
    const sendResponse = pendingRequests.get(requestId);
    if (sendResponse) {
      sendResponse({ result, error });
      pendingRequests.delete(requestId);
    }
  });

  console.log('[WebMCP] Bridge initialized');
}

/**
 * 获取指定标签页的可用工具
 */
export function getTabTools(tabId: number): SiteTool[] {
  const config = registeredSiteTools.get(tabId);
  return config?.tools || [];
}

/**
 * 获取所有已注册的网站工具
 */
export function getAllRegisteredTools(): Map<number, SiteConfig> {
  return registeredSiteTools;
}

/**
 * 等待标签页加载完成
 */
function waitForTabLoad(tabId: number, timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('页面加载超时'));
    }, timeout);

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        // 额外等待一点时间让 JS 执行完成
        setTimeout(resolve, 500);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * 执行网站工具 - 直接在页面上执行
 * 支持 __navigate__ + __then__ 协议用于需要页面跳转的操作
 */
export async function executeWebMCPTool(
  tabId: number,
  toolName: string,
  params: Record<string, any>,
): Promise<{ result: any; error: string | null }> {
  const config = registeredSiteTools.get(tabId);
  if (!config) {
    return { result: null, error: '该标签页没有注册工具' };
  }

  const tool = config.tools.find((t) => t.name === toolName);
  if (!tool) {
    return { result: null, error: `工具 ${toolName} 未找到` };
  }

  try {
    // 直接在页面上执行工具 handler
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (handlerCode: string, toolParams: Record<string, any>) => {
        return new Promise((resolve) => {
          try {
            const handler = eval(`(${handlerCode})`);
            Promise.resolve(handler(toolParams))
              .then((result) => resolve({ result, error: null }))
              .catch((err) => resolve({ result: null, error: err.message }));
          } catch (e: any) {
            resolve({ result: null, error: e.message });
          }
        });
      },
      args: [tool.handler, params],
    });

    if (!results || !results[0]) {
      return { result: null, error: '执行失败' };
    }

    const firstResult = results[0].result as { result: any; error: string | null };

    // 检查是否需要导航 + 后续执行
    if (firstResult.result && firstResult.result.__navigate__ && firstResult.result.__then__) {
      const navigateUrl = firstResult.result.__navigate__;
      const thenCode = firstResult.result.__then__;

      console.log(`[WebMCP] 导航到: ${navigateUrl}`);

      // 导航到目标 URL
      await chrome.tabs.update(tabId, { url: navigateUrl });

      // 等待页面加载完成
      await waitForTabLoad(tabId);

      console.log(`[WebMCP] 页面加载完成，执行后续代码`);

      // 重新注册工具到新页面
      const newTab = await chrome.tabs.get(tabId);
      if (newTab.url) {
        const newConfig = await getSiteConfig(newTab.url);
        if (newConfig) {
          await registerSiteTools(tabId, newConfig);
        }
      }

      // 执行后续代码
      const thenResults = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (code: string) => {
          return new Promise((resolve) => {
            try {
              const result = eval(code);
              Promise.resolve(result)
                .then((r) => resolve({ result: r, error: null }))
                .catch((err) => resolve({ result: null, error: err.message }));
            } catch (e: any) {
              resolve({ result: null, error: e.message });
            }
          });
        },
        args: [thenCode],
      });

      if (thenResults && thenResults[0]) {
        return thenResults[0].result as { result: any; error: string | null };
      }
      return { result: null, error: '后续执行失败' };
    }

    return firstResult;
  } catch (error: any) {
    return { result: null, error: error.message };
  }
}

/**
 * 手动为指定标签页或当前活动标签页检测并注册工具
 * @param targetTabId - 可选，指定要检测的标签页 ID
 */
export async function detectAndRegisterTools(targetTabId?: number): Promise<{
  tabId: number;
  siteName: string;
  tools: string[];
} | null> {
  let tab: chrome.tabs.Tab | undefined;

  if (targetTabId) {
    // 使用指定的 tabId
    tab = await chrome.tabs.get(targetTabId);
  } else {
    // 使用当前活动标签页
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = activeTab;
  }

  if (!tab?.id || !tab.url) return null;

  const siteConfig = await getSiteConfig(tab.url);
  if (!siteConfig) return null;

  await registerSiteTools(tab.id, siteConfig);

  // Notify native server about the registered tools
  notifyNativeServerToolsUpdate('register', tab.id, siteConfig.siteName, siteConfig.tools);

  return {
    tabId: tab.id,
    siteName: siteConfig.siteName,
    tools: siteConfig.tools.map((t) => t.name),
  };
}

/**
 * 获取所有配置的站点列表 (从 API)
 */
export async function getConfiguredSites(): Promise<
  Array<{
    site_name: string;
    url_pattern: string;
    tool_count: number;
    tools: string[];
  }>
> {
  try {
    const response = await fetch(`${WORLDBOOK_API_URL}/sites`);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.log('[WebMCP] Failed to fetch sites from API:', error);
    // 返回本地配置作为后备
    return siteToolsConfig.map((c) => ({
      site_name: c.siteName,
      url_pattern: String(c.urlPattern),
      tool_count: c.tools.length,
      tools: c.tools.map((t) => t.name),
    }));
  }
}
