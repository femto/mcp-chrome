# Privacy Policy for Chrome MCP Server

**Last Updated: June 11, 2026**

## Overview

Chrome MCP Server is a browser extension that enables AI agents to interact with your browser through the Model Context Protocol (MCP). This privacy policy explains how the extension handles your data.

## Data Collection

### Anonymous Analytics

When using the WebMCP feature to access website tools from Worldbook, the extension generates a random anonymous identifier (UUID) to help us understand usage patterns (daily/monthly active users). This identifier:

- Is randomly generated and stored locally
- Is **not** associated with any personal information
- Is **not** used to track your browsing behavior
- Is only sent when accessing the Worldbook WebMCP API

### Other Data

**We do not collect, store, or transmit any other personal data to external servers.**

All other data processed by this extension remains entirely on your local machine.

## Data Usage

The extension accesses browser data solely to perform automation tasks requested by you through MCP-compatible AI agents. This includes:

- **Tab Information**: To navigate, read content, and interact with web pages
- **Browsing History**: Only when explicitly requested by the user through AI commands
- **Bookmarks**: Only when explicitly requested by the user through AI commands
- **Downloads**: To manage file downloads when requested
- **Page Content**: To read and interact with web page elements

All this data is:

- Processed locally on your device
- Never transmitted to external servers
- Never sold or shared with third parties
- Only accessed when you initiate commands through your AI agent

## Native Messaging

The extension communicates with a local Node.js server (`mcp-chrome-bridger`) running on your machine via Chrome's Native Messaging API. This communication:

- Stays entirely on your local machine
- Does not involve any external network requests
- Is used only to relay commands between your AI agent and the browser

## Third-Party Services

### Worldbook WebMCP API

When using the WebMCP feature, the extension may communicate with the Worldbook API (`worldbook.it.com`) to fetch website tool configurations. This communication:

- Sends the URL pattern you are visiting (to match available tools)
- Sends an anonymous client ID (UUID) for usage statistics
- Does **not** send any personal information or browsing history

You can disable Worldbook WebMCP integration in the extension settings.

### Other Services

This extension does not integrate with any other third-party analytics, advertising, or data collection services.

## Data Storage

The extension stores minimal configuration data using Chrome's local storage API, including:

- Connection settings
- Anonymous client ID (UUID) for analytics

This data:

- Never leaves your device (except the anonymous UUID sent with API requests)
- Can be cleared by uninstalling the extension

## Your Choices

- **Disable WebMCP**: Turn off Worldbook WebMCP integration in settings to prevent any communication with external APIs

## Open Source

This extension is open source. You can review the complete source code at:
https://github.com/femto/mcp-chrome

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be reflected in the "Last Updated" date above.

## Contact

If you have any questions about this privacy policy, please open an issue on our GitHub repository.
