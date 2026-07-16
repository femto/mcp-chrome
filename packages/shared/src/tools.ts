import { type Tool } from '@modelcontextprotocol/sdk/types.js';

export const TOOL_NAMES = {
  BROWSER: {
    GET_WINDOWS_AND_TABS: 'get_windows_and_tabs',
    BATCH: 'chrome_batch',
    SEARCH_TABS_CONTENT: 'search_tabs_content',
    NAVIGATE: 'chrome_navigate',
    SCREENSHOT: 'chrome_screenshot',
    PAGE_SNAPSHOT: 'chrome_page_snapshot',
    CLOSE_TABS: 'chrome_close_tabs',
    SWITCH_TAB: 'chrome_switch_tab',
    GO_BACK_OR_FORWARD: 'chrome_go_back_or_forward',
    WEB_FETCHER: 'chrome_get_web_content',
    CLICK: 'chrome_click_element',
    FILL: 'chrome_fill_or_select',
    GET_INTERACTIVE_ELEMENTS: 'chrome_get_interactive_elements',
    NETWORK_CAPTURE_START: 'chrome_network_capture_start',
    NETWORK_CAPTURE_STOP: 'chrome_network_capture_stop',
    NETWORK_REQUEST: 'chrome_network_request',
    NETWORK_DEBUGGER_START: 'chrome_network_debugger_start',
    NETWORK_DEBUGGER_STOP: 'chrome_network_debugger_stop',
    KEYBOARD: 'chrome_keyboard',
    HISTORY: 'chrome_history',
    BOOKMARK_SEARCH: 'chrome_bookmark_search',
    BOOKMARK_ADD: 'chrome_bookmark_add',
    BOOKMARK_DELETE: 'chrome_bookmark_delete',
    INJECT_SCRIPT: 'chrome_inject_script',
    SEND_COMMAND_TO_INJECT_SCRIPT: 'chrome_send_command_to_inject_script',
    CONSOLE: 'chrome_console',
    FILE_UPLOAD: 'chrome_upload_file',
    // WebMCP 动态网站工具
    WEBMCP_LIST_TOOLS: 'webmcp_list_tools',
    WEBMCP_DETECT_TOOLS: 'webmcp_detect_tools',
    WEBMCP_CALL_TOOL: 'webmcp_call_tool',
  },
};

export const TOOL_SCHEMAS: Tool[] = [
  {
    name: TOOL_NAMES.BROWSER.GET_WINDOWS_AND_TABS,
    description: 'Get all currently open browser windows and tabs',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.BATCH,
    description: 'Execute multiple tool calls sequentially in a single request',
    inputSchema: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          description: 'Ordered list of tool calls to execute sequentially.',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description:
                  'Tool name to call, such as chrome_fill_or_select or chrome_click_element.',
              },
              args: {
                type: 'object',
                description: 'Arguments passed to that tool call.',
                additionalProperties: true,
              },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
        stopOnError: {
          type: 'boolean',
          description: 'Stop after the first failed action. Defaults to true.',
        },
      },
      required: ['actions'],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.NAVIGATE,
    description:
      'Navigate to a URL by activating an existing matching tab when possible, opening a new tab or window, or refreshing the current tab',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to the website specified' },
        newWindow: {
          type: 'boolean',
          description: 'Create a new window to navigate to the URL or not. Defaults to false',
        },
        width: {
          type: 'number',
          description:
            'Window width in pixels. Used for new windows, or to resize the target window when newWindow is false.',
        },
        height: {
          type: 'number',
          description:
            'Window height in pixels. Used for new windows, or to resize the target window when newWindow is false.',
        },
        refresh: {
          type: 'boolean',
          description:
            'Refresh the current active tab instead of navigating to a URL. When true, the url parameter is ignored. Defaults to false',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.SCREENSHOT,
    description:
      'Take a screenshot of the current page or a specific element. Base64 screenshots are normalized to CSS-pixel space when possible, so normal viewport screenshots usually use the same x/y coordinates as chrome_click_element.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for the screenshot, if saving as PNG' },
        selector: { type: 'string', description: 'CSS selector for element to screenshot' },
        width: { type: 'number', description: 'Width in pixels (default: 800)' },
        height: { type: 'number', description: 'Height in pixels (default: 600)' },
        storeBase64: {
          type: 'boolean',
          description:
            'return screenshot in base64 format (default: false) if you want to see the page, recommend set this to be true',
        },
        fullPage: {
          type: 'boolean',
          description: 'Store screenshot of the entire page (default: true)',
        },
        savePng: {
          type: 'boolean',
          description:
            'Save screenshot as PNG file (default: true)，if you want to see the page, recommend set this to be false, and set storeBase64 to be true',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.PAGE_SNAPSHOT,
    description: 'Get an AI-friendly semantic snapshot of the current page or a selected subtree',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description:
            'Optional CSS selector for the root element to snapshot. Defaults to the current page body.',
        },
        format: {
          type: 'string',
          description: 'Snapshot output format. Supported values: yaml (default) or json.',
          enum: ['yaml', 'json'],
        },
        includeRefs: {
          type: 'boolean',
          description:
            'Whether to include stable refs like [ref=e7] for interactive elements (default: true).',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.CLOSE_TABS,
    description: 'Close one or more browser tabs',
    inputSchema: {
      type: 'object',
      properties: {
        tabIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of tab IDs to close. If not provided, will close the active tab.',
        },
        url: {
          type: 'string',
          description: 'Close tabs matching this URL. Can be used instead of tabIds.',
        },
        windowId: {
          type: 'number',
          description:
            'Close all tabs in the specified window. Closing the last tab will also close the window.',
        },
        currentWindow: {
          type: 'boolean',
          description:
            'Close all tabs in the current active window. Closing the last tab will also close the window.',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.SWITCH_TAB,
    description: 'Switch to a specific browser tab',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The ID of the tab to switch to.',
        },
        windowId: {
          type: 'number',
          description: 'The ID of the window where the tab is located.',
        },
      },
      required: ['tabId'],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.GO_BACK_OR_FORWARD,
    description: 'Navigate back or forward in browser history',
    inputSchema: {
      type: 'object',
      properties: {
        isForward: {
          type: 'boolean',
          description: 'Go forward in history if true, go back if false (default: false)',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.WEB_FETCHER,
    description: 'Fetch content from a web page',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to fetch content from. If not provided, uses the current active tab',
        },
        htmlContent: {
          type: 'boolean',
          description:
            'Get the visible HTML content of the page. If true, textContent will be ignored (default: false)',
        },
        textContent: {
          type: 'boolean',
          description:
            'Get the visible text content of the page with metadata. Ignored if htmlContent is true (default: true)',
        },

        selector: {
          type: 'string',
          description:
            'CSS selector to get content from a specific element. If provided, only content from this element will be returned',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.CLICK,
    description:
      'Click on an element in the current page or at specific coordinates. Coordinates are viewport CSS pixels by default.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description:
            'Snapshot ref for an element discovered from chrome_page_snapshot, such as e7.',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for the element to click. Use selector, ref, or coordinates.',
        },
        coordinates: {
          type: 'object',
          description:
            'Coordinates to click at in viewport CSS pixels. If provided, takes precedence over selector.',
          properties: {
            x: {
              type: 'number',
              description: 'X coordinate in viewport CSS pixels',
            },
            y: {
              type: 'number',
              description: 'Y coordinate in viewport CSS pixels',
            },
          },
          required: ['x', 'y'],
        },
        fromScreenshot: {
          type: 'boolean',
          description:
            'If true, interpret coordinates as coming from the most recent screenshot and map them back to viewport CSS pixels. Usually only needed for scaled screenshots or element/full-page screenshots.',
        },
        waitForNavigation: {
          type: 'boolean',
          description: 'Wait for page navigation to complete after click (default: false)',
        },
        timeout: {
          type: 'number',
          description:
            'Timeout in milliseconds for waiting for the element or navigation (default: 5000)',
        },
        useCDP: {
          type: 'boolean',
          description:
            'Use Chrome DevTools Protocol for clicking. This enables clicking through Shadow DOM (including closed shadow roots). Requires coordinates to be provided. Use this for sites with custom web components like Reddit that use Shadow DOM. (default: false)',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.FILL,
    description: 'Fill a form element or select an option with the specified value',
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description:
            'Snapshot ref for an element discovered from chrome_page_snapshot, such as e7.',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for the input element to fill or select. Use selector or ref.',
        },
        value: {
          type: 'string',
          description: 'Value to fill or select into the element',
        },
        useCDP: {
          type: 'boolean',
          description:
            'Use Chrome DevTools Protocol for trusted input. Enable this for complex editors (like Lexical, ProseMirror) or sites with strict CSP (like Twitter, Reddit). Bypasses Content Security Policy restrictions. (default: false)',
        },
        pierceShadow: {
          type: 'boolean',
          description:
            'Pierce through Shadow DOM (including closed shadow roots) when finding elements. Requires useCDP=true. Use this for sites with custom web components like Reddit, that use Shadow DOM to encapsulate their inputs. (default: false)',
        },
      },
      required: ['value'],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.GET_INTERACTIVE_ELEMENTS,
    description: 'Get interactive elements from the current page',
    inputSchema: {
      type: 'object',
      properties: {
        textQuery: {
          type: 'string',
          description: 'Text to search for within interactive elements (fuzzy search)',
        },
        selector: {
          type: 'string',
          description:
            'CSS selector to filter interactive elements. Takes precedence over textQuery if both are provided.',
        },
        includeCoordinates: {
          type: 'boolean',
          description: 'Include element coordinates in the response (default: true)',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.NETWORK_REQUEST,
    description: 'Send a network request from the browser with cookies and other browser context',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to send the request to',
        },
        method: {
          type: 'string',
          description: 'HTTP method to use (default: GET)',
        },
        headers: {
          type: 'object',
          description: 'Headers to include in the request',
        },
        body: {
          type: 'string',
          description: 'Body of the request (for POST, PUT, etc.)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.NETWORK_DEBUGGER_START,
    description:
      'Start capturing network requests from a web page using Chrome Debugger API（with responseBody）',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'URL to capture network requests from. If not provided, uses the current active tab',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.NETWORK_DEBUGGER_STOP,
    description:
      'Stop capturing network requests using Chrome Debugger API and return the captured data',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.NETWORK_CAPTURE_START,
    description:
      'Start capturing network requests from a web page using Chrome webRequest API(without responseBody)',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'URL to capture network requests from. If not provided, uses the current active tab',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.NETWORK_CAPTURE_STOP,
    description:
      'Stop capturing network requests using webRequest API and return the captured data',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.KEYBOARD,
    description: 'Simulate keyboard events in the browser',
    inputSchema: {
      type: 'object',
      properties: {
        keys: {
          type: 'string',
          description: 'Keys to simulate (e.g., "Enter", "Ctrl+C", "A,B,C" for sequence)',
        },
        selector: {
          type: 'string',
          description:
            'CSS selector for the element to send keyboard events to (optional, defaults to active element)',
        },
        delay: {
          type: 'number',
          description: 'Delay between key sequences in milliseconds (optional, default: 0)',
        },
        useCDP: {
          type: 'boolean',
          description:
            'Use Chrome DevTools Protocol for trusted key events (more reliable for PageUp/PageDown/Home/End)',
        },
      },
      required: ['keys'],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.HISTORY,
    description: 'Retrieve and search browsing history from Chrome',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description:
            'Text to search for in history URLs and titles. Leave empty to retrieve all history entries within the time range.',
        },
        startTime: {
          type: 'string',
          description:
            'Start time as a date string. Supports ISO format (e.g., "2023-10-01", "2023-10-01T14:30:00"), relative times (e.g., "1 day ago", "2 weeks ago", "3 months ago", "1 year ago"), and special keywords ("now", "today", "yesterday"). Default: 24 hours ago',
        },
        endTime: {
          type: 'string',
          description:
            'End time as a date string. Supports ISO format (e.g., "2023-10-31", "2023-10-31T14:30:00"), relative times (e.g., "1 day ago", "2 weeks ago", "3 months ago", "1 year ago"), and special keywords ("now", "today", "yesterday"). Default: current time',
        },
        maxResults: {
          type: 'number',
          description:
            'Maximum number of history entries to return. Use this to limit results for performance or to focus on the most relevant entries. (default: 100)',
        },
        excludeCurrentTabs: {
          type: 'boolean',
          description:
            "When set to true, filters out URLs that are currently open in any browser tab. Useful for finding pages you've visited but don't have open anymore. (default: false)",
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.BOOKMARK_SEARCH,
    description: 'Search Chrome bookmarks by title and URL',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Search query to match against bookmark titles and URLs. Leave empty to retrieve all bookmarks.',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of bookmarks to return (default: 50)',
        },
        folderPath: {
          type: 'string',
          description:
            'Optional folder path or ID to limit search to a specific bookmark folder. Can be a path string (e.g., "Work/Projects") or a folder ID.',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.BOOKMARK_ADD,
    description: 'Add a new bookmark to Chrome',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to bookmark. If not provided, uses the current active tab URL.',
        },
        title: {
          type: 'string',
          description: 'Title for the bookmark. If not provided, uses the page title from the URL.',
        },
        parentId: {
          type: 'string',
          description:
            'Parent folder path or ID to add the bookmark to. Can be a path string (e.g., "Work/Projects") or a folder ID. If not provided, adds to the "Bookmarks Bar" folder.',
        },
        createFolder: {
          type: 'boolean',
          description: 'Whether to create the parent folder if it does not exist (default: false)',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.BOOKMARK_DELETE,
    description: 'Delete a bookmark from Chrome',
    inputSchema: {
      type: 'object',
      properties: {
        bookmarkId: {
          type: 'string',
          description: 'ID of the bookmark to delete. Either bookmarkId or url must be provided.',
        },
        url: {
          type: 'string',
          description: 'URL of the bookmark to delete. Used if bookmarkId is not provided.',
        },
        title: {
          type: 'string',
          description: 'Title of the bookmark to help with matching when deleting by URL.',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.SEARCH_TABS_CONTENT,
    description:
      'search for related content from the currently open tab and return the corresponding web pages.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'the query to search for related content.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.INJECT_SCRIPT,
    description:
      'inject the user-specified content script into the webpage. By default, inject into the currently active tab',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'If a URL is specified, inject the script into the webpage corresponding to the URL.',
        },
        type: {
          type: 'string',
          description:
            'the javaScript world for a script to execute within. must be ISOLATED or MAIN',
        },
        jsScript: {
          type: 'string',
          description: 'the content script to inject',
        },
      },
      required: ['type', 'jsScript'],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.SEND_COMMAND_TO_INJECT_SCRIPT,
    description:
      'if the script injected using chrome_inject_script listens for user-defined events, this tool can be used to trigger those events',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description:
            'the tab where you previously injected the script(if not provided,  use the currently active tab)',
        },
        eventName: {
          type: 'string',
          description: 'the eventName your injected content script listen for',
        },
        payload: {
          type: 'string',
          description: 'the payload passed to event, must be a json string',
        },
      },
      required: ['eventName'],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.CONSOLE,
    description:
      'Capture and retrieve all console output from the current active browser tab/page. This captures console messages that existed before the tool was called.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'URL to navigate to and capture console from. If not provided, uses the current active tab',
        },
        includeExceptions: {
          type: 'boolean',
          description: 'Include uncaught exceptions in the output (default: true)',
        },
        maxMessages: {
          type: 'number',
          description: 'Maximum number of console messages to capture (default: 100)',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.FILE_UPLOAD,
    description:
      'Upload files to web forms with file input elements using Chrome DevTools Protocol',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the file input element (input[type="file"])',
        },
        filePath: {
          type: 'string',
          description: 'Local file path to upload',
        },
        fileUrl: {
          type: 'string',
          description: 'URL to download file from before uploading',
        },
        base64Data: {
          type: 'string',
          description: 'Base64 encoded file data to upload',
        },
        fileName: {
          type: 'string',
          description: 'Optional filename when using base64 or URL (default: "uploaded-file")',
        },
        multiple: {
          type: 'boolean',
          description: 'Whether the input accepts multiple files (default: false)',
        },
      },
      required: ['selector'],
    },
  },
  // WebMCP 动态网站工具
  {
    name: TOOL_NAMES.BROWSER.WEBMCP_LIST_TOOLS,
    description:
      'List all available WebMCP tools for websites. Shows both registered tools (active tabs) and configured site tools.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Optional tab ID to get tools for a specific tab only',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.WEBMCP_DETECT_TOOLS,
    description:
      'Detect and register WebMCP tools for a specific tab or the current active tab. Use this when visiting a supported website to enable site-specific tools.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description:
            'Optional tab ID to detect tools for. If not provided, uses the current active tab.',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.BROWSER.WEBMCP_CALL_TOOL,
    description:
      'Call a WebMCP site-specific tool. Use webmcp_list_tools or webmcp_detect_tools first to see available tools.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description:
            'Tab ID where the tool should be executed. If not provided, uses active tab.',
        },
        toolName: {
          type: 'string',
          description:
            'Name of the WebMCP tool to call (e.g., "google_search", "youtube_play_pause")',
        },
        params: {
          type: 'object',
          description:
            'Parameters to pass to the tool. Check webmcp_list_tools for required params.',
        },
      },
      required: ['toolName'],
    },
  },
];
