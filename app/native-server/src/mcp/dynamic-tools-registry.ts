import { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Log to file instead of stdout (stdout is used by native messaging protocol)
const LOG_FILE = path.join(os.tmpdir(), 'mcp-chrome-native.log');
function logToFile(msg: string) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] [dynamic-tools] ${msg}\n`);
}

/**
 * Dynamic tool information
 */
export interface DynamicTool {
  name: string; // e.g., wechat_insert_article
  siteName: string; // e.g., wechat
  originalName: string; // e.g., insert_article
  tabId: number;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Input schema (WebMCP standard format)
 */
interface InputSchema {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
}

/**
 * Site tool from WebMCP config (WebMCP standard format)
 */
interface SiteTool {
  name: string;
  description: string;
  inputSchema?: InputSchema; // 可选，兼容旧格式
}

// Global dynamic tools registry
const dynamicToolsRegistry = new Map<string, DynamicTool>();

/**
 * Register dynamic tools for a site
 * @returns true if tools were changed
 */
export function registerDynamicTools(tabId: number, siteName: string, tools: SiteTool[]): boolean {
  let changed = false;

  tools.forEach((tool) => {
    const name = `${siteName}_${tool.name}`;
    if (!dynamicToolsRegistry.has(name)) {
      // 兼容处理：如果没有 inputSchema，使用默认空 schema
      const inputSchema = tool.inputSchema || {
        type: 'object' as const,
        properties: {},
      };

      dynamicToolsRegistry.set(name, {
        name,
        siteName,
        originalName: tool.name,
        tabId,
        description: `[${siteName}] ${tool.description}`,
        inputSchema,
      });
      changed = true;
      logToFile(`[DynamicTools] Registered: ${name}`);
    }
  });

  return changed;
}

/**
 * Unregister dynamic tools for a tab
 * @returns true if tools were changed
 */
export function unregisterDynamicTools(tabId: number): boolean {
  let changed = false;
  for (const [name, tool] of dynamicToolsRegistry) {
    if (tool.tabId === tabId) {
      dynamicToolsRegistry.delete(name);
      changed = true;
      logToFile(`[DynamicTools] Unregistered: ${name}`);
    }
  }
  return changed;
}

/**
 * Unregister tools for a site (when navigating away)
 * @returns true if tools were changed
 */
export function unregisterDynamicToolsBySite(siteName: string): boolean {
  let changed = false;
  for (const [name, tool] of dynamicToolsRegistry) {
    if (tool.siteName === siteName) {
      dynamicToolsRegistry.delete(name);
      changed = true;
      logToFile(`[DynamicTools] Unregistered by site: ${name}`);
    }
  }
  return changed;
}

/**
 * Get all dynamic tools as MCP Tool schemas
 */
export function getDynamicToolSchemas(): Tool[] {
  const tools = Array.from(dynamicToolsRegistry.values()).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
  logToFile(
    `[DynamicTools] getDynamicToolSchemas called, returning ${tools.length} tools: ${tools.map((t) => t.name).join(', ')}`,
  );
  return tools;
}

/**
 * Get a specific dynamic tool by name
 */
export function getDynamicTool(name: string): DynamicTool | undefined {
  return dynamicToolsRegistry.get(name);
}

/**
 * Check if a tool name is a dynamic tool
 */
export function isDynamicTool(name: string): boolean {
  return dynamicToolsRegistry.has(name);
}

/**
 * Clear all dynamic tools
 */
export function clearAllDynamicTools(): void {
  dynamicToolsRegistry.clear();
  logToFile('[DynamicTools] Cleared all dynamic tools');
}

/**
 * Get count of registered dynamic tools
 */
export function getDynamicToolsCount(): number {
  return dynamicToolsRegistry.size;
}
