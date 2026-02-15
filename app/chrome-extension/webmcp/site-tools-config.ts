/**
 * WebMCP Site Tools Configuration
 * 定义每个网站的 MCP 工具
 */

/**
 * JSON Schema for tool input (WebMCP standard)
 */
export interface InputSchema {
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

export interface SiteTool {
  name: string;
  description: string;
  // WebMCP 标准格式的参数 schema
  inputSchema: InputSchema;
  // 工具执行的 JS 代码，会在页面上下文中执行
  // 可以访问 DOM，接收 params 参数
  handler: string;
}

export interface SiteConfig {
  // URL 匹配模式，支持通配符
  urlPattern: string | RegExp;
  // 网站名称标识
  siteName: string;
  // 该网站提供的工具
  tools: SiteTool[];
}

/**
 * 网站工具配置
 * 你可以在这里添加任意网站的工具定义
 */
export const siteToolsConfig: SiteConfig[] = [
  // 示例：航班预订网站
  {
    urlPattern: '*://www.booking.com/*',
    siteName: 'booking',
    tools: [
      {
        name: 'search_hotels',
        description: '搜索酒店，填写目的地和日期',
        inputSchema: {
          type: 'object',
          properties: {
            destination: { type: 'string', description: '目的地城市' },
            checkIn: { type: 'string', description: '入住日期 (YYYY-MM-DD)' },
            checkOut: { type: 'string', description: '退房日期 (YYYY-MM-DD)' },
            guests: { type: 'number', description: '入住人数' },
          },
          required: ['destination', 'checkIn', 'checkOut'],
        },
        handler: `
          async (params) => {
            const searchBox = document.querySelector('[data-testid="destination-container"] input');
            if (searchBox) {
              searchBox.value = params.destination;
              searchBox.dispatchEvent(new Event('input', { bubbles: true }));
            }
            // 更多逻辑...
            return { success: true, message: '已填写搜索条件' };
          }
        `,
      },
    ],
  },

  // 示例：Google 搜索 (支持多个域名)
  {
    urlPattern: /^https?:\/\/(www\.)?google\.(com|com\.hk|co\.jp|co\.uk|ca|com\.au|de|fr)(\/.*)?$/,
    siteName: 'google',
    tools: [
      {
        name: 'google_search',
        description: '在 Google 上搜索',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
          },
          required: ['query'],
        },
        handler: `
          async (params) => {
            const searchBox = document.querySelector('input[name="q"], textarea[name="q"]');
            if (searchBox) {
              searchBox.value = params.query;
              searchBox.dispatchEvent(new Event('input', { bubbles: true }));
              // 提交搜索
              const form = searchBox.closest('form');
              if (form) form.submit();
              return { success: true, message: '搜索已提交: ' + params.query };
            }
            return { success: false, message: '未找到搜索框' };
          }
        `,
      },
      {
        name: 'get_search_results',
        description: '获取当前 Google 搜索结果',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        handler: `
          async (params) => {
            const results = [];
            document.querySelectorAll('#search .g').forEach((el, i) => {
              const title = el.querySelector('h3')?.textContent;
              const link = el.querySelector('a')?.href;
              const snippet = el.querySelector('.VwiC3b')?.textContent;
              if (title && link) {
                results.push({ index: i + 1, title, link, snippet });
              }
            });
            return { success: true, results };
          }
        `,
      },
    ],
  },

  // 示例：GitHub
  {
    urlPattern: '*://github.com/*',
    siteName: 'github',
    tools: [
      {
        name: 'github_star_repo',
        description: '给当前仓库点 Star',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        handler: `
          async (params) => {
            const starButton = document.querySelector('button[data-ga-click*="star"]');
            if (starButton && !starButton.textContent.includes('Unstar')) {
              starButton.click();
              return { success: true, message: '已点击 Star' };
            }
            return { success: false, message: '未找到 Star 按钮或已经 Star 过了' };
          }
        `,
      },
      {
        name: 'github_get_repo_info',
        description: '获取当前仓库信息',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        handler: `
          async (params) => {
            const repoName = document.querySelector('[itemprop="name"] a')?.textContent?.trim();
            const description = document.querySelector('[data-pjax="#repo-content-pjax-container"] p')?.textContent?.trim();
            const stars = document.querySelector('#repo-stars-counter-star')?.getAttribute('title');
            const forks = document.querySelector('#repo-network-counter')?.getAttribute('title');
            return {
              success: true,
              repo: { name: repoName, description, stars, forks }
            };
          }
        `,
      },
    ],
  },

  // 示例：淘宝
  {
    urlPattern: '*://*.taobao.com/*',
    siteName: 'taobao',
    tools: [
      {
        name: 'taobao_search',
        description: '在淘宝搜索商品',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '搜索关键词' },
          },
          required: ['keyword'],
        },
        handler: `
          async (params) => {
            const searchBox = document.querySelector('#q');
            if (searchBox) {
              searchBox.value = params.keyword;
              searchBox.dispatchEvent(new Event('input', { bubbles: true }));
              const searchBtn = document.querySelector('.btn-search');
              if (searchBtn) searchBtn.click();
              return { success: true, message: '已搜索: ' + params.keyword };
            }
            return { success: false, message: '未找到搜索框' };
          }
        `,
      },
    ],
  },

  // 示例：YouTube
  {
    urlPattern: '*://www.youtube.com/*',
    siteName: 'youtube',
    tools: [
      {
        name: 'youtube_search',
        description: '在 YouTube 搜索视频',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
          },
          required: ['query'],
        },
        handler: `
          async (params) => {
            const searchBox = document.querySelector('input#search');
            if (searchBox) {
              searchBox.value = params.query;
              searchBox.dispatchEvent(new Event('input', { bubbles: true }));
              const searchBtn = document.querySelector('#search-icon-legacy');
              if (searchBtn) searchBtn.click();
              return { success: true, message: '已搜索: ' + params.query };
            }
            return { success: false, message: '未找到搜索框' };
          }
        `,
      },
      {
        name: 'youtube_play_pause',
        description: '播放/暂停当前视频',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        handler: `
          async (params) => {
            const video = document.querySelector('video');
            if (video) {
              if (video.paused) {
                video.play();
                return { success: true, message: '视频已播放' };
              } else {
                video.pause();
                return { success: true, message: '视频已暂停' };
              }
            }
            return { success: false, message: '未找到视频' };
          }
        `,
      },
      {
        name: 'youtube_get_video_info',
        description: '获取当前视频信息',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        handler: `
          async (params) => {
            const title = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim();
            const channel = document.querySelector('#channel-name a')?.textContent?.trim();
            const views = document.querySelector('#info-strings yt-formatted-string')?.textContent;
            const video = document.querySelector('video');
            return {
              success: true,
              video: {
                title,
                channel,
                views,
                duration: video ? video.duration : null,
                currentTime: video ? video.currentTime : null
              }
            };
          }
        `,
      },
    ],
  },
];

/**
 * 根据 URL 匹配网站配置
 */
export function matchSiteConfig(url: string): SiteConfig | null {
  for (const config of siteToolsConfig) {
    if (typeof config.urlPattern === 'string') {
      // 将通配符模式转换为正则表达式
      const pattern = config.urlPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      if (new RegExp(`^${pattern}$`).test(url)) {
        return config;
      }
    } else if (config.urlPattern instanceof RegExp) {
      if (config.urlPattern.test(url)) {
        return config;
      }
    }
  }
  return null;
}
