#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { COMMAND_NAME, LEGACY_WRAPPER_SCRIPT_BASENAMES, WRAPPER_SCRIPT_BASENAME } from './constant';
import { colorText, tryRegisterUserLevelHost } from './utils';

// Check if this script is run directly
const isDirectRun = require.main === module;

// Check if we're in a monorepo/workspace development environment
function isWorkspaceDev(): boolean {
  // If we're inside a .pnpm store or node_modules of a workspace, skip auto-register
  // This prevents overwriting developer's local native host config during pnpm install
  if (__dirname.includes('/node_modules/.pnpm/') || __dirname.includes('\\node_modules\\.pnpm\\')) {
    return true;
  }
  return false;
}

/**
 * Write Node.js path for wrapper scripts to avoid fragile relative paths
 */
async function writeNodePath(): Promise<void> {
  try {
    const nodePath = process.execPath;
    const nodePathFile = path.join(__dirname, '..', 'node_path.txt');

    console.log(colorText(`Writing Node.js path: ${nodePath}`, 'blue'));
    fs.writeFileSync(nodePathFile, nodePath, 'utf8');
    console.log(colorText('✓ Node.js path written for wrapper scripts', 'green'));
  } catch (error: any) {
    console.warn(colorText(`⚠️ Failed to write Node.js path: ${error.message}`, 'yellow'));
  }
}

function getWrapperScriptPaths(extension: '.sh' | '.bat'): string[] {
  return [WRAPPER_SCRIPT_BASENAME, ...LEGACY_WRAPPER_SCRIPT_BASENAMES].map((baseName) =>
    path.join(__dirname, '..', `${baseName}${extension}`),
  );
}

/**
 * 确保执行权限（无论是否为全局安装）
 */
async function ensureExecutionPermissions(): Promise<void> {
  if (process.platform === 'win32') {
    // Windows 平台处理
    await ensureWindowsFilePermissions();
    return;
  }

  // Unix/Linux 平台处理
  const filesToCheck = [
    path.join(__dirname, '..', 'index.js'),
    ...getWrapperScriptPaths('.sh'),
    path.join(__dirname, '..', 'cli.js'),
  ];

  for (const filePath of filesToCheck) {
    if (fs.existsSync(filePath)) {
      try {
        fs.chmodSync(filePath, '755');
        console.log(
          colorText(`✓ Set execution permissions for ${path.basename(filePath)}`, 'green'),
        );
      } catch (err: any) {
        console.warn(
          colorText(
            `⚠️ Unable to set execution permissions for ${path.basename(filePath)}: ${err.message}`,
            'yellow',
          ),
        );
      }
    } else {
      console.warn(colorText(`⚠️ File not found: ${filePath}`, 'yellow'));
    }
  }
}

/**
 * Windows 平台文件权限处理
 */
async function ensureWindowsFilePermissions(): Promise<void> {
  const filesToCheck = [
    path.join(__dirname, '..', 'index.js'),
    ...getWrapperScriptPaths('.bat'),
    path.join(__dirname, '..', 'cli.js'),
  ];

  for (const filePath of filesToCheck) {
    if (fs.existsSync(filePath)) {
      try {
        // 检查文件是否为只读，如果是则移除只读属性
        const stats = fs.statSync(filePath);
        if (!(stats.mode & parseInt('200', 8))) {
          // 检查写权限
          // 尝试移除只读属性
          fs.chmodSync(filePath, stats.mode | parseInt('200', 8));
          console.log(
            colorText(`✓ Removed read-only attribute from ${path.basename(filePath)}`, 'green'),
          );
        }

        // 验证文件可读性
        fs.accessSync(filePath, fs.constants.R_OK);
        console.log(
          colorText(`✓ Verified file accessibility for ${path.basename(filePath)}`, 'green'),
        );
      } catch (err: any) {
        console.warn(
          colorText(
            `⚠️ Unable to verify file permissions for ${path.basename(filePath)}: ${err.message}`,
            'yellow',
          ),
        );
      }
    } else {
      console.warn(colorText(`⚠️ File not found: ${filePath}`, 'yellow'));
    }
  }
}

async function tryRegisterNativeHost(): Promise<void> {
  try {
    console.log(colorText('Attempting to register Chrome Native Messaging host...', 'blue'));

    // Always ensure execution permissions
    await ensureExecutionPermissions();

    // Try user-level installation (no elevated permissions required)
    const userLevelSuccess = await tryRegisterUserLevelHost();

    if (!userLevelSuccess) {
      console.log(
        colorText(
          'User-level installation failed, system-level installation may be needed',
          'yellow',
        ),
      );
      console.log(
        colorText('Please run the following command for system-level installation:', 'blue'),
      );
      console.log(`  ${COMMAND_NAME} register --system`);
      printManualInstructions();
    }
  } catch (error) {
    console.log(
      colorText(
        `Registration error: ${error instanceof Error ? error.message : String(error)}`,
        'red',
      ),
    );
    printManualInstructions();
  }
}

/**
 * 打印手动安装指南
 */
function printManualInstructions(): void {
  console.log('\n' + colorText('===== Manual Registration Guide =====', 'blue'));

  console.log(colorText('1. Try user-level installation (recommended):', 'yellow'));
  console.log(`  ${COMMAND_NAME} register`);

  console.log(
    colorText('\n2. If user-level installation fails, try system-level installation:', 'yellow'),
  );

  if (os.platform() === 'win32') {
    console.log(colorText('   Run Command Prompt as Administrator:', 'yellow'));
    console.log(`  ${COMMAND_NAME} register --system`);
  } else {
    console.log(colorText('   Run with sudo:', 'yellow'));
    console.log(`  sudo ${COMMAND_NAME} register`);
  }

  console.log(
    '\n' +
      colorText(
        'Ensure Chrome extension is installed and refresh the extension to connect to local service.',
        'blue',
      ),
  );
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log(colorText(`Installing ${COMMAND_NAME}...`, 'green'));

  // Skip auto-registration in workspace/monorepo development
  if (isWorkspaceDev()) {
    console.log(colorText('Workspace development detected, skipping auto-registration', 'yellow'));
    console.log(colorText(`Run "${COMMAND_NAME} register" manually if needed`, 'blue'));
    return;
  }

  // Always ensure execution permissions first
  await ensureExecutionPermissions();

  // Write Node.js path for wrapper scripts to use
  await writeNodePath();

  // Always try to register - user-level registration is safe and what users expect
  await tryRegisterNativeHost();
}

// Export main for use by postinstall-check.js
export { main };

// Execute main function when running this script directly
if (isDirectRun) {
  main().catch((error) => {
    console.error(
      colorText(
        `Installation script error: ${error instanceof Error ? error.message : String(error)}`,
        'red',
      ),
    );
  });
}
