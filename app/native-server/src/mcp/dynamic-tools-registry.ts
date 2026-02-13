import { Tool } from '@modelcontextprotocol/sdk/types.js';

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
 * Tool parameter from WebMCP config
 */
interface ToolParam {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

/**
 * Site tool from WebMCP config
 */
interface SiteTool {
  name: string;
  description: string;
  params: ToolParam[];
}

// Global dynamic tools registry
const dynamicToolsRegistry = new Map<string, DynamicTool>();

/**
 * Build input schema from tool params
 */
function buildInputSchema(params: ToolParam[]): DynamicTool['inputSchema'] {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  params.forEach((param) => {
    properties[param.name] = {
      type: param.type,
      description: param.description,
    };
    if (param.required) {
      required.push(param.name);
    }
  });

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

/**
 * Register dynamic tools for a site
 * @returns true if tools were changed
 */
export function registerDynamicTools(tabId: number, siteName: string, tools: SiteTool[]): boolean {
  let changed = false;

  tools.forEach((tool) => {
    const name = `${siteName}_${tool.name}`;
    if (!dynamicToolsRegistry.has(name)) {
      dynamicToolsRegistry.set(name, {
        name,
        siteName,
        originalName: tool.name,
        tabId,
        description: `[${siteName}] ${tool.description}`,
        inputSchema: buildInputSchema(tool.params),
      });
      changed = true;
      console.log(`[DynamicTools] Registered: ${name}`);
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
      console.log(`[DynamicTools] Unregistered: ${name}`);
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
      console.log(`[DynamicTools] Unregistered by site: ${name}`);
    }
  }
  return changed;
}

/**
 * Get all dynamic tools as MCP Tool schemas
 */
export function getDynamicToolSchemas(): Tool[] {
  return Array.from(dynamicToolsRegistry.values()).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
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
  console.log('[DynamicTools] Cleared all dynamic tools');
}

/**
 * Get count of registered dynamic tools
 */
export function getDynamicToolsCount(): number {
  return dynamicToolsRegistry.size;
}
