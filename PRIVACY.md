# Privacy Policy for Chrome MCP Server

**Last Updated: January 24, 2026**

## Overview

Chrome MCP Server is a browser extension that enables AI agents to interact with your browser through the Model Context Protocol (MCP). This privacy policy explains how the extension handles your data.

## Data Collection

**We do not collect, store, or transmit any personal data to external servers.**

All data processed by this extension remains entirely on your local machine.

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

This extension does not integrate with any third-party analytics, advertising, or data collection services.

## Data Storage

The extension stores minimal configuration data (such as connection settings) using Chrome's local storage API. This data:

- Never leaves your device
- Can be cleared by uninstalling the extension

## Open Source

This extension is open source. You can review the complete source code at:
https://github.com/nickelchen/mcp-chrome

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be reflected in the "Last Updated" date above.

## Contact

If you have any questions about this privacy policy, please open an issue on our GitHub repository.
