/**
 * WebMCP Manager
 * 管理动态网站工具的注册和执行
 */

import { siteToolsConfig, matchSiteConfig, SiteConfig, SiteTool } from './site-tools-config';
import { NativeMessageType } from 'chrome-mcp-shared';
import { emit as emitBusMessage } from '@/entrypoints/background/native-message-bus';

// Worldbook API 配置
const DEFAULT_WORLDBOOK_API_URL = 'https://worldbook.it.com/api/webmcp';
let cachedWorldbookApiUrl: string | null = null;
let cachedWorldbookEnabled: boolean | null = null;

function getStorage<T extends Record<string, any>>(keys: string[]): Promise<T> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result as T));
  });
}

async function isWorldbookWebMCPEnabled(): Promise<boolean> {
  if (cachedWorldbookEnabled !== null) {
    return cachedWorldbookEnabled;
  }

  try {
    const result = await getStorage<{ worldbookWebMCPEnabled?: boolean }>([
      'worldbookWebMCPEnabled',
    ]);
    // Default to true
    cachedWorldbookEnabled = result.worldbookWebMCPEnabled !== false;
    return cachedWorldbookEnabled;
  } catch (error) {
    console.log('[WebMCP] Failed to read Worldbook WebMCP preference:', error);
    return true; // Enable by default
  }
}

async function getWorldbookApiUrl(): Promise<string> {
  if (cachedWorldbookApiUrl) {
    return cachedWorldbookApiUrl;
  }

  try {
    const result = await getStorage<{ webmcpApiUrl?: string; worldbookApiUrl?: string }>([
      'webmcpApiUrl',
      'worldbookApiUrl',
    ]);
    const candidate = (result.webmcpApiUrl || result.worldbookApiUrl || '').trim();
    if (candidate) {
      cachedWorldbookApiUrl = candidate;
      return cachedWorldbookApiUrl;
    }
  } catch (error) {
    console.log('[WebMCP] Failed to read Worldbook API override from storage:', error);
  }

  cachedWorldbookApiUrl = DEFAULT_WORLDBOOK_API_URL;
  return cachedWorldbookApiUrl;
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.webmcpApiUrl || changes.worldbookApiUrl) {
    const next = (
      (changes.webmcpApiUrl?.newValue as string | undefined) ||
      (changes.worldbookApiUrl?.newValue as string | undefined) ||
      ''
    ).trim();
    cachedWorldbookApiUrl = next || DEFAULT_WORLDBOOK_API_URL;
  }
  if (changes.worldbookWebMCPEnabled !== undefined) {
    cachedWorldbookEnabled = changes.worldbookWebMCPEnabled.newValue !== false;
    console.log(`[WebMCP] Worldbook WebMCP preference changed to: ${cachedWorldbookEnabled}`);
  }
});

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
      // 使用 WebMCP 标准格式：inputSchema
      payload.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
    }

    // Send message via internal message bus (for intra-background communication)
    emitBusMessage('forward_to_native', {
      type: NativeMessageType.WEBMCP_TOOLS_UPDATE,
      payload,
    });
    console.log(`[WebMCP] Sent tools update to native server: ${action}`);
  }, 300);
}

// API 响应类型 - WebMCP 标准格式
interface ApiInputSchema {
  type: 'object';
  properties: Record<
    string,
    {
      type: string;
      description?: string;
      enum?: string[];
    }
  >;
  required?: string[];
}

interface ApiTool {
  name: string;
  description: string;
  inputSchema: ApiInputSchema;
  handler: string;
}

interface ApiSiteConfig {
  url_pattern: string;
  site_name: string;
  tools: ApiTool[];
}

// 存储当前已注册的网站工具
const registeredSiteTools = new Map<number, SiteConfig>();

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
      inputSchema: t.inputSchema,
      handler: t.handler,
    })),
  };
}

/**
 * 从 Worldbook API 获取匹配的站点配置
 */
async function fetchSiteConfigFromAPI(url: string): Promise<SiteConfig | null> {
  try {
    const apiUrl = await getWorldbookApiUrl();
    const response = await fetch(`${apiUrl}/match?url=${encodeURIComponent(url)}`);
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
 * Get site config - prefer API, fallback to local config
 */
async function getSiteConfig(url: string): Promise<SiteConfig | null> {
  // Check if Worldbook WebMCP is enabled
  const worldbookEnabled = await isWorldbookWebMCPEnabled();

  if (worldbookEnabled) {
    // Try to fetch from Worldbook API first
    const apiConfig = await fetchSiteConfigFromAPI(url);
    if (apiConfig) {
      console.log(`[WebMCP] Got config from Worldbook API: ${apiConfig.siteName}`);
      return apiConfig;
    }
  } else {
    console.log(`[WebMCP] Worldbook WebMCP disabled, skipping API request`);
  }

  // Fallback to local config if API fails or disabled
  const localConfig = matchSiteConfig(url);
  if (localConfig) {
    console.log(`[WebMCP] Using local config: ${localConfig.siteName}`);
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
 * 使用 lazy eval + 缓存：只存储 handler 字符串，首次调用时编译并缓存
 * 这样既安全（避免 IIFE 在页面加载时执行），又高效（后续调用复用编译结果）
 */
function injectWebMCPExecutor(tools: Array<{ name: string; handler: string }>) {
  // 防止重复注入
  if ((window as any).__WEBMCP_EXECUTOR_LOADED__) return;
  (window as any).__WEBMCP_EXECUTOR_LOADED__ = true;

  // 存储工具 handler 字符串（不立即 eval）
  const toolHandlers = new Map<string, string>();
  // 缓存编译后的函数
  const compiledCache = new Map<string, (...args: unknown[]) => unknown>();

  // 只存储 handler 字符串，不编译
  tools.forEach((tool) => {
    toolHandlers.set(tool.name, tool.handler);
    console.log(`[WebMCP] 注册工具: ${tool.name}`);
  });

  // 监听工具执行请求 (通过 postMessage 从 ISOLATED world)
  // 注意：不能使用 async/await，因为 esbuild 会转换成 __async helper，在 MAIN world 中不存在
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'webmcp:execute-tool') return;

    const { requestId, toolName, params } = event.data;
    console.log(`[WebMCP] 执行工具: ${toolName}`, params);

    const handlerCode = toolHandlers.get(toolName);
    if (!handlerCode) {
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

    // Lazy eval + 缓存: 首次调用时编译，后续复用
    Promise.resolve()
      .then(() => {
        let handler = compiledCache.get(toolName);
        if (!handler) {
          console.log(`[WebMCP] 首次编译工具: ${toolName}`);
          handler = eval(`(${handlerCode})`) as (...args: unknown[]) => unknown;
          compiledCache.set(toolName, handler);
        }
        return handler(params);
      })
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
            // Defensive: if params is a string, parse it
            const actualParams =
              typeof toolParams === 'string' ? JSON.parse(toolParams) : toolParams;

            const handler = eval(`(${handlerCode})`);
            Promise.resolve(handler(actualParams))
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
 * Re-send all registered tools to native server
 * Called when native server restarts
 */
export function resendAllToolsToNative(): void {
  console.log('[WebMCP] Resending all registered tools to native server');
  registeredSiteTools.forEach((config, tabId) => {
    console.log(`[WebMCP] Resending tools for tab ${tabId}: ${config.siteName}`);
    notifyNativeServerToolsUpdate('register', tabId, config.siteName, config.tools);
  });
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
  // 检查 Worldbook WebMCP 是否启用
  const worldbookEnabled = await isWorldbookWebMCPEnabled();

  if (worldbookEnabled) {
    try {
      const apiUrl = await getWorldbookApiUrl();
      const response = await fetch(`${apiUrl}/sites`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.log('[WebMCP] Failed to fetch sites from API:', error);
    }
  }

  // 返回本地配置作为后备
  return siteToolsConfig.map((c) => ({
    site_name: c.siteName,
    url_pattern: String(c.urlPattern),
    tool_count: c.tools.length,
    tools: c.tools.map((t) => t.name),
  }));
}
