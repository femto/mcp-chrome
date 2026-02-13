/**
 * WebMCP Module Entry
 * 导出所有 WebMCP 相关功能
 */

export { initWebMCPListener, getConfiguredSites } from './webmcp-manager';
export { listWebMCPToolsTool, detectWebMCPToolsTool, callWebMCPToolTool } from './webmcp-tool';
export { siteToolsConfig, matchSiteConfig } from './site-tools-config';
export type { SiteConfig, SiteTool, SiteToolParam } from './site-tools-config';
