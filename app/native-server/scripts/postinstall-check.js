#!/usr/bin/env node

/**
 * Postinstall wrapper script
 * Checks if the compiled postinstall.js exists before running it.
 * This handles CI environments where dist/ doesn't exist yet during pnpm install.
 */

const fs = require('fs');
const path = require('path');

const postinstallPath = path.join(__dirname, '..', 'dist', 'scripts', 'postinstall.js');

if (fs.existsSync(postinstallPath)) {
  // dist/ exists, run the actual postinstall script
  const postinstall = require(postinstallPath);
  // Call main() - it's exported from the module
  if (postinstall.main) {
    postinstall.main().catch((error) => {
      console.error('Postinstall error:', error.message || error);
    });
  }
} else {
  // dist/ doesn't exist yet (CI build or fresh clone)
  // This is expected - the postinstall will run when users install the published package
  console.log('Skipping postinstall: dist/ not built yet (CI/development environment)');
}
