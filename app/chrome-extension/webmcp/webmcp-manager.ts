/**
 * WebMCP Manager
 * Manages registration and execution of dynamic website tools
 */

import { siteToolsConfig, matchSiteConfig, SiteConfig, SiteTool } from './site-tools-config';
import { getLocalRecordedSiteConfig, getLocalRecordedSiteSummaries } from './recorder';
import { NativeMessageType } from 'mcp-chrome-shared';
import { emit as emitBusMessage } from '@/entrypoints/background/native-message-bus';

// Worldbook API configuration
const DEFAULT_WORLDBOOK_API_URL = 'https://worldbook.it.com/api/webmcp';
let cachedWorldbookApiUrl: string | null = null;
let cachedWorldbookEnabled: boolean | null = null;
let cachedClientId: string | null = null;

/**
 * Get or generate an anonymous clientId (UUID) for analytics tracking.
 * Used for DAU/MAU statistics, not associated with any personal information.
 */
async function getOrCreateClientId(): Promise<string> {
  if (cachedClientId) {
    return cachedClientId;
  }

  try {
    const result = await getStorage<{ clientId?: string }>(['clientId']);
    if (result.clientId) {
      cachedClientId = result.clientId;
      return cachedClientId;
    }

    // Generate new UUID
    cachedClientId = crypto.randomUUID();
    await chrome.storage.local.set({ clientId: cachedClientId });
    console.log('[WebMCP] Generated new anonymous clientId for analytics');
    return cachedClientId;
  } catch (error) {
    console.log('[WebMCP] Failed to get/create clientId:', error);
    // Return fixed error ID so server knows something went wrong
    return 'error-failed-to-get-client-id';
  }
}

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
      // Use WebMCP standard format: inputSchema
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

// API response types - WebMCP standard format
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

// Store currently registered site tools
const registeredSiteTools = new Map<number, SiteConfig>();

function mergeSiteConfigs(
  primary: SiteConfig | null,
  secondary: SiteConfig | null,
): SiteConfig | null {
  if (!primary && !secondary) return null;
  if (!primary) return secondary;
  if (!secondary) return primary;

  const mergedTools: SiteTool[] = [];
  const seen = new Set<string>();
  for (const tool of [...primary.tools, ...secondary.tools]) {
    if (seen.has(tool.name)) continue;
    seen.add(tool.name);
    mergedTools.push(tool);
  }

  return {
    ...primary,
    tools: mergedTools,
  };
}

/**
 * Convert API response to local SiteConfig format
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
 * Fetch matching site config from Worldbook API.
 * Includes anonymous clientId in request for DAU/MAU analytics.
 */
async function fetchSiteConfigFromAPI(url: string): Promise<SiteConfig | null> {
  try {
    const apiUrl = await getWorldbookApiUrl();
    const clientId = await getOrCreateClientId();
    const response = await fetch(`${apiUrl}/match?url=${encodeURIComponent(url)}`, {
      headers: { 'X-Client-Id': clientId },
    });
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
  const recordedConfig = await getLocalRecordedSiteConfig(url);

  // Check if Worldbook WebMCP is enabled
  const worldbookEnabled = await isWorldbookWebMCPEnabled();

  if (worldbookEnabled) {
    // Try to fetch from Worldbook API first
    const apiConfig = await fetchSiteConfigFromAPI(url);
    if (apiConfig) {
      console.log(`[WebMCP] Got config from Worldbook API: ${apiConfig.siteName}`);
      return mergeSiteConfigs(apiConfig, recordedConfig);
    }
  } else {
    console.log(`[WebMCP] Worldbook WebMCP disabled, skipping API request`);
  }

  // Fallback to local config if API fails or disabled
  const localConfig = matchSiteConfig(url);
  if (localConfig) {
    console.log(`[WebMCP] Using local config: ${localConfig.siteName}`);
  }
  return mergeSiteConfigs(localConfig, recordedConfig);
}

/**
 * Initialize WebMCP listeners
 */
export function initWebMCPListener() {
  // Listen for tab updates, auto-detect and register tools
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
      // Check if we need to unregister old tools (URL changed to non-matching site)
      const oldConfig = registeredSiteTools.get(tabId);

      const siteConfig = await getSiteConfig(tab.url);
      if (siteConfig) {
        // Only register if not already registered for this site
        if (!oldConfig || oldConfig.siteName !== siteConfig.siteName) {
          console.log(`[WebMCP] Detected matching site: ${siteConfig.siteName} (${tab.url})`);
          await registerSiteTools(tabId, siteConfig);

          // Notify native server about new tools
          notifyNativeServerToolsUpdate('register', tabId, siteConfig.siteName, siteConfig.tools);
        }
      } else if (oldConfig) {
        // URL changed to non-matching site, unregister old tools
        console.log(
          `[WebMCP] Tab ${tabId} navigated away from ${oldConfig.siteName}, cleaning up tools`,
        );
        registeredSiteTools.delete(tabId);
        notifyNativeServerToolsUpdate('unregister', tabId);
      }
    }
  });

  // Listen for tab close, clean up tools
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (registeredSiteTools.has(tabId)) {
      console.log(`[WebMCP] Tab ${tabId} closed, cleaning up tools`);
      registeredSiteTools.delete(tabId);
      notifyNativeServerToolsUpdate('unregister', tabId);
    }
  });

  // Listen for message requests (for debugging and testing)
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.type === 'webmcp:detect-tools') {
      detectAndRegisterTools()
        .then((result) => sendResponse({ success: true, result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true; // Keep port open for async response
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
 * Register site tools for a tab
 */
async function registerSiteTools(tabId: number, siteConfig: SiteConfig) {
  try {
    // Inject WebMCP executor script
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectWebMCPExecutor,
      args: [siteConfig.tools.map((t) => ({ name: t.name, handler: t.handler }))],
      world: 'MAIN',
    });

    // Inject bridge script for communication
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectWebMCPBridge,
      world: 'ISOLATED',
    });

    registeredSiteTools.set(tabId, siteConfig);
    console.log(`[WebMCP] Registered ${siteConfig.tools.length} tools for tab ${tabId}`);
  } catch (error) {
    console.error(`[WebMCP] Failed to register tools:`, error);
  }
}

/**
 * Executor injected into MAIN world.
 * Uses lazy eval + caching: stores handler strings, compiles on first call and caches.
 * This is both safe (avoids IIFE execution at page load) and efficient (reuses compiled results).
 */
function injectWebMCPExecutor(tools: Array<{ name: string; handler: string }>) {
  // Prevent duplicate injection
  if ((window as any).__WEBMCP_EXECUTOR_LOADED__) return;
  (window as any).__WEBMCP_EXECUTOR_LOADED__ = true;

  // Store tool handler strings (don't eval immediately)
  const toolHandlers = new Map<string, string>();
  // Cache compiled functions
  const compiledCache = new Map<string, (...args: unknown[]) => unknown>();

  // Only store handler strings, don't compile
  tools.forEach((tool) => {
    toolHandlers.set(tool.name, tool.handler);
    console.log(`[WebMCP] Registered tool: ${tool.name}`);
  });

  // Listen for tool execution requests (via postMessage from ISOLATED world)
  // Note: can't use async/await because esbuild transforms to __async helper which doesn't exist in MAIN world
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'webmcp:execute-tool') return;

    const { requestId, toolName, params } = event.data;
    console.log(`[WebMCP] Executing tool: ${toolName}`, params);

    const handlerCode = toolHandlers.get(toolName);
    if (!handlerCode) {
      window.postMessage(
        {
          type: 'webmcp:tool-result',
          requestId,
          result: null,
          error: `Tool ${toolName} not found`,
        },
        '*',
      );
      return;
    }

    // Lazy eval + caching: compile on first call, reuse afterwards
    Promise.resolve()
      .then(() => {
        let handler = compiledCache.get(toolName);
        if (!handler) {
          console.log(`[WebMCP] First-time compiling tool: ${toolName}`);
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
 * Bridge script injected into ISOLATED world
 */
function injectWebMCPBridge() {
  if ((window as any).__WEBMCP_BRIDGE_LOADED__) return;
  (window as any).__WEBMCP_BRIDGE_LOADED__ = true;

  const pendingRequests = new Map<string, (response: any) => void>();

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.type === 'webmcp:call-tool') {
      const requestId = `req-${Date.now()}-${Math.random()}`;
      pendingRequests.set(requestId, sendResponse);

      // Forward to MAIN world via postMessage
      window.postMessage(
        {
          type: 'webmcp:execute-tool',
          requestId,
          toolName: request.toolName,
          params: request.params,
        },
        '*',
      );

      return true; // Async response
    }
  });

  // Listen for results from MAIN world (via postMessage)
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
 * Get available tools for a specific tab
 */
export function getTabTools(tabId: number): SiteTool[] {
  const config = registeredSiteTools.get(tabId);
  return config?.tools || [];
}

/**
 * Get all registered site tools
 */
export function getAllRegisteredTools(): Map<number, SiteConfig> {
  return registeredSiteTools;
}

/**
 * Wait for tab to finish loading
 */
function waitForTabLoad(tabId: number, timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Page load timeout'));
    }, timeout);

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        // Wait a bit more for JS to finish executing
        setTimeout(resolve, 500);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * Execute site tool - runs directly on the page.
 * Supports __navigate__ + __then__ protocol for operations requiring page navigation.
 */
export async function executeWebMCPTool(
  tabId: number,
  toolName: string,
  params: Record<string, any>,
): Promise<{ result: any; error: string | null }> {
  const config = registeredSiteTools.get(tabId);
  if (!config) {
    return { result: null, error: 'No tools registered for this tab' };
  }

  const tool = config.tools.find((t) => t.name === toolName);
  if (!tool) {
    return { result: null, error: `Tool ${toolName} not found` };
  }

  try {
    // Execute tool handler directly on the page
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
      return { result: null, error: 'Execution failed' };
    }

    const firstResult = results[0].result as { result: any; error: string | null };

    // Check if navigation + follow-up execution is needed
    if (firstResult.result && firstResult.result.__navigate__ && firstResult.result.__then__) {
      const navigateUrl = firstResult.result.__navigate__;
      const thenCode = firstResult.result.__then__;

      console.log(`[WebMCP] Navigating to: ${navigateUrl}`);

      // Navigate to target URL
      await chrome.tabs.update(tabId, { url: navigateUrl });

      // Wait for page to finish loading
      await waitForTabLoad(tabId);

      console.log(`[WebMCP] Page loaded, executing follow-up code`);

      // Re-register tools for the new page
      const newTab = await chrome.tabs.get(tabId);
      if (newTab.url) {
        const newConfig = await getSiteConfig(newTab.url);
        if (newConfig) {
          await registerSiteTools(tabId, newConfig);
        }
      }

      // Execute follow-up code
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
      return { result: null, error: 'Follow-up execution failed' };
    }

    return firstResult;
  } catch (error: any) {
    return { result: null, error: error.message };
  }
}

/**
 * Manually detect and register tools for a specific tab or the current active tab.
 * @param targetTabId - Optional, the tab ID to detect tools for
 */
export async function detectAndRegisterTools(targetTabId?: number): Promise<{
  tabId: number;
  siteName: string;
  tools: string[];
} | null> {
  let tab: chrome.tabs.Tab | undefined;

  if (targetTabId) {
    // Use specified tabId
    tab = await chrome.tabs.get(targetTabId);
  } else {
    // Use current active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = activeTab;
  }

  if (!tab?.id || !tab.url) return null;

  const siteConfig = await getSiteConfig(tab.url);
  if (!siteConfig) {
    if (registeredSiteTools.has(tab.id)) {
      registeredSiteTools.delete(tab.id);
      notifyNativeServerToolsUpdate('unregister', tab.id);
    }
    return null;
  }

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
 * Get all configured sites list (from API)
 */
export async function getConfiguredSites(): Promise<
  Array<{
    site_name: string;
    url_pattern: string;
    tool_count: number;
    tools: string[];
  }>
> {
  // Check if Worldbook WebMCP is enabled
  const worldbookEnabled = await isWorldbookWebMCPEnabled();

  if (worldbookEnabled) {
    try {
      const apiUrl = await getWorldbookApiUrl();
      const clientId = await getOrCreateClientId();
      const response = await fetch(`${apiUrl}/sites`, {
        headers: { 'X-Client-Id': clientId },
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.log('[WebMCP] Failed to fetch sites from API:', error);
    }
  }

  // Return local config as fallback
  const configuredSites = siteToolsConfig.map((c) => ({
    site_name: c.siteName,
    url_pattern: String(c.urlPattern),
    tool_count: c.tools.length,
    tools: c.tools.map((t) => t.name),
  }));

  const recordedSites = await getLocalRecordedSiteSummaries();
  return [...configuredSites, ...recordedSites];
}
