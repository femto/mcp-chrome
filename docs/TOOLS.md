# Chrome MCP Server API Reference 📚

Complete reference for all available tools and their parameters.

## 📋 Table of Contents

- [Browser Management](#browser-management)
- [Screenshots & Visual](#screenshots--visual)
- [Network Monitoring](#network-monitoring)
- [Content Analysis](#content-analysis)
- [Interaction](#interaction)
- [Data Management](#data-management)
- [Response Format](#response-format)

## 📊 Browser Management

### `get_windows_and_tabs`

List all currently open browser windows and tabs.

**Parameters**: None

**Response**:

```json
{
  "windowCount": 2,
  "tabCount": 5,
  "windows": [
    {
      "windowId": 123,
      "tabs": [
        {
          "tabId": 456,
          "url": "https://example.com",
          "title": "Example Page",
          "active": true
        }
      ]
    }
  ]
}
```

### `chrome_navigate`

Navigate to a URL with optional viewport control.

**Parameters**:

- `url` (string, required): URL to navigate to
- `newWindow` (boolean, optional): Create new window (default: false)
- `width` (number, optional): Viewport width in pixels (default: 1280)
- `height` (number, optional): Viewport height in pixels (default: 720)

**Example**:

```json
{
  "url": "https://example.com",
  "newWindow": true,
  "width": 1920,
  "height": 1080
}
```

### `chrome_close_tabs`

Close specific tabs or windows.

**Parameters**:

- `tabIds` (array, optional): Array of tab IDs to close
- `windowIds` (array, optional): Array of window IDs to close

**Example**:

```json
{
  "tabIds": [123, 456],
  "windowIds": [789]
}
```

### `chrome_switch_tab`

Switch to a specific browser tab.

**Parameters**:

- `tabId` (number, required): The ID of the tab to switch to.
- `windowId` (number, optional): The ID of the window where the tab is located.

**Example**:

```json
{
  "tabId": 456,
  "windowId": 123
}
```

### `chrome_go_back_or_forward`

Navigate browser history.

**Parameters**:

- `direction` (string, required): "back" or "forward"
- `tabId` (number, optional): Specific tab ID (default: active tab)

**Example**:

```json
{
  "direction": "back",
  "tabId": 123
}
```

## 📸 Screenshots & Visual

### `chrome_screenshot`

Take advanced screenshots with various options.

**Parameters**:

- `name` (string, optional): Screenshot filename
- `selector` (string, optional): CSS selector for element screenshot
- `width` (number, optional): Width in pixels (default: 800)
- `height` (number, optional): Height in pixels (default: 600)
- `storeBase64` (boolean, optional): Return base64 data (default: false)
- `fullPage` (boolean, optional): Capture full page (default: true)

**Example**:

```json
{
  "selector": ".main-content",
  "fullPage": true,
  "storeBase64": true,
  "width": 1920,
  "height": 1080
}
```

**Response**:

```json
{
  "success": true,
  "base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "dimensions": {
    "width": 1920,
    "height": 1080
  }
}
```

## 🌐 Network Monitoring

### `chrome_network_capture_start`

Start capturing network requests using webRequest API.

**Parameters**:

- `url` (string, optional): URL to navigate to and capture
- `maxCaptureTime` (number, optional): Maximum capture time in ms (default: 30000)
- `inactivityTimeout` (number, optional): Stop after inactivity in ms (default: 3000)
- `includeStatic` (boolean, optional): Include static resources (default: false)

**Example**:

```json
{
  "url": "https://api.example.com",
  "maxCaptureTime": 60000,
  "includeStatic": false
}
```

### `chrome_network_capture_stop`

Stop network capture and return collected data.

**Parameters**: None

**Response**:

```json
{
  "success": true,
  "capturedRequests": [
    {
      "url": "https://api.example.com/data",
      "method": "GET",
      "status": 200,
      "requestHeaders": {...},
      "responseHeaders": {...},
      "responseTime": 150
    }
  ],
  "summary": {
    "totalRequests": 15,
    "captureTime": 5000
  }
}
```

### `chrome_network_debugger_start`

Start capturing with Chrome Debugger API (includes response bodies).

**Parameters**:

- `url` (string, optional): URL to navigate to and capture

### `chrome_network_debugger_stop`

Stop debugger capture and return data with response bodies.

### `chrome_network_request`

Send custom HTTP requests.

**Parameters**:

- `url` (string, required): Request URL
- `method` (string, optional): HTTP method (default: "GET")
- `headers` (object, optional): Request headers
- `body` (string, optional): Request body

**Example**:

```json
{
  "url": "https://api.example.com/data",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": "{\"key\": \"value\"}"
}
```

## 🔍 Content Analysis

### `chrome_get_web_content`

Extract HTML or text content from web pages.

**Parameters**:

- `format` (string, optional): "html" or "text" (default: "text")
- `selector` (string, optional): CSS selector for specific elements
- `tabId` (number, optional): Specific tab ID (default: active tab)

**Example**:

```json
{
  "format": "text",
  "selector": ".article-content"
}
```

### `chrome_get_interactive_elements`

Find clickable and interactive elements on the page.

**Parameters**:

- `tabId` (number, optional): Specific tab ID (default: active tab)

**Response**:

```json
{
  "elements": [
    {
      "selector": "#submit-button",
      "type": "button",
      "text": "Submit",
      "visible": true,
      "clickable": true
    }
  ]
}
```

## 🎯 Interaction

### `chrome_click_element`

Click elements using CSS selectors.

**Parameters**:

- `selector` (string, required): CSS selector for target element
- `tabId` (number, optional): Specific tab ID (default: active tab)

**Example**:

```json
{
  "selector": "#submit-button"
}
```

### `chrome_fill_or_select`

Fill form fields or select options.

**Parameters**:

- `selector` (string, required): CSS selector for target element
- `value` (string, required): Value to fill or select
- `tabId` (number, optional): Specific tab ID (default: active tab)

**Example**:

```json
{
  "selector": "#email-input",
  "value": "user@example.com"
}
```

### `chrome_keyboard`

Simulate keyboard input and shortcuts.

**Parameters**:

- `keys` (string, required): Key combination (e.g., "Ctrl+C", "Enter")
- `selector` (string, optional): Target element selector
- `delay` (number, optional): Delay between keystrokes in ms (default: 0)

**Example**:

```json
{
  "keys": "Ctrl+A",
  "selector": "#text-input",
  "delay": 100
}
```

## 📚 Data Management

### `chrome_history`

Search browser history with filters.

**Parameters**:

- `text` (string, optional): Search text in URL/title
- `startTime` (string, optional): Start date (ISO format)
- `endTime` (string, optional): End date (ISO format)
- `maxResults` (number, optional): Maximum results (default: 100)
- `excludeCurrentTabs` (boolean, optional): Exclude current tabs (default: true)

**Example**:

```json
{
  "text": "github",
  "startTime": "2024-01-01",
  "maxResults": 50
}
```

### `chrome_bookmark_search`

Search bookmarks by keywords.

**Parameters**:

- `query` (string, optional): Search keywords
- `maxResults` (number, optional): Maximum results (default: 100)
- `folderPath` (string, optional): Search within specific folder

**Example**:

```json
{
  "query": "documentation",
  "maxResults": 20,
  "folderPath": "Work/Resources"
}
```

### `chrome_bookmark_add`

Add new bookmarks with folder support.

**Parameters**:

- `url` (string, optional): URL to bookmark (default: current tab)
- `title` (string, optional): Bookmark title (default: page title)
- `parentId` (string, optional): Parent folder ID or path
- `createFolder` (boolean, optional): Create folder if not exists (default: false)

**Example**:

```json
{
  "url": "https://example.com",
  "title": "Example Site",
  "parentId": "Work/Resources",
  "createFolder": true
}
```

### `chrome_bookmark_delete`

Delete bookmarks by ID or URL.

**Parameters**:

- `bookmarkId` (string, optional): Bookmark ID to delete
- `url` (string, optional): URL to find and delete

**Example**:

```json
{
  "url": "https://example.com"
}
```

## 📋 Response Format

All tools return responses in the following format:

```json
{
  "content": [
    {
      "type": "text",
      "text": "JSON string containing the actual response data"
    }
  ],
  "isError": false
}
```

For errors:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error message describing what went wrong"
    }
  ],
  "isError": true
}
```

## 🔧 Usage Examples

### Complete Workflow Example

```javascript
// 1. Navigate to a page
await callTool('chrome_navigate', {
  url: 'https://example.com',
});

// 2. Take a screenshot
const screenshot = await callTool('chrome_screenshot', {
  fullPage: true,
  storeBase64: true,
});

// 3. Start network monitoring
await callTool('chrome_network_capture_start', {
  maxCaptureTime: 30000,
});

// 4. Interact with the page
await callTool('chrome_click_element', {
  selector: '#load-data-button',
});

// 5. Stop network capture
const networkData = await callTool('chrome_network_capture_stop');

// 6. Save bookmark
await callTool('chrome_bookmark_add', {
  title: 'Data Analysis Page',
  parentId: 'Work/Analytics',
});
```

This API provides comprehensive browser automation capabilities with content extraction and analysis features.
