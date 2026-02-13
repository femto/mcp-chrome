# Chrome MCP Server - Build Instructions

## Chrome Extension Build

### Local Development (with fixed extension ID)

```bash
cd app/chrome-extension
pnpm wxt build
```

This uses the key from `.env.local` to maintain a consistent extension ID (`gkgkeiahoaihgefckmjckmennckgaege`) for local testing.

### Chrome Web Store Release (without key)

```bash
cd app/chrome-extension
CHROME_EXTENSION_KEY= pnpm wxt build
```

Or temporarily rename/delete `.env.local` before building.

The Chrome Web Store manages its own extension key, so the manifest must not contain a `key` field when publishing.

### Package for Upload

```bash
cd app/chrome-extension/.output
zip -r chrome-mcp-server-x.x.x.zip chrome-mv3
```

## Native Server Build

```bash
cd app/native-server
pnpm build
```

## Shared Package Build

```bash
cd packages/shared
pnpm build
```

## Full Rebuild (all packages)

```bash
pnpm -r build
```

## Version Update

Update version in `app/chrome-extension/package.json` before building for release.
