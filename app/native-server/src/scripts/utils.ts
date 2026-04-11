import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { promisify } from 'util';
import {
  COMMAND_NAME,
  DESCRIPTION,
  EXTENSION_ID,
  EXTENSION_ID_WEBSTORE,
  EXTRA_EXTENSION_IDS_ENV,
  HOST_NAME,
  LEGACY_HOST_NAMES,
  LEGACY_WRAPPER_SCRIPT_BASENAMES,
  WRAPPER_SCRIPT_BASENAME,
} from './constant';
import { BrowserType, getBrowserConfig, detectInstalledBrowsers } from './browser-config';

export const access = promisify(fs.access);
export const mkdir = promisify(fs.mkdir);
export const writeFile = promisify(fs.writeFile);

/**
 * 打印彩色文本
 */
export function colorText(text: string, color: string): string {
  const colors: Record<string, string> = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
  };

  return colors[color] + text + colors.reset;
}

/**
 * Get user-level manifest file path
 */
export function getUserManifestPath(hostName: string = HOST_NAME): string {
  if (os.platform() === 'win32') {
    // Windows: %APPDATA%\Google\Chrome\NativeMessagingHosts\
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'Google',
      'Chrome',
      'NativeMessagingHosts',
      `${hostName}.json`,
    );
  } else if (os.platform() === 'darwin') {
    // macOS: ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Google',
      'Chrome',
      'NativeMessagingHosts',
      `${hostName}.json`,
    );
  } else {
    // Linux: ~/.config/google-chrome/NativeMessagingHosts/
    return path.join(
      os.homedir(),
      '.config',
      'google-chrome',
      'NativeMessagingHosts',
      `${hostName}.json`,
    );
  }
}

/**
 * Get system-level manifest file path
 */
export function getSystemManifestPath(hostName: string = HOST_NAME): string {
  if (os.platform() === 'win32') {
    // Windows: %ProgramFiles%\Google\Chrome\NativeMessagingHosts\
    return path.join(
      process.env.ProgramFiles || 'C:\\Program Files',
      'Google',
      'Chrome',
      'NativeMessagingHosts',
      `${hostName}.json`,
    );
  } else if (os.platform() === 'darwin') {
    // macOS: /Library/Google/Chrome/NativeMessagingHosts/
    return path.join('/Library', 'Google', 'Chrome', 'NativeMessagingHosts', `${hostName}.json`);
  } else {
    // Linux: /etc/opt/chrome/native-messaging-hosts/
    return path.join('/etc', 'opt', 'chrome', 'native-messaging-hosts', `${hostName}.json`);
  }
}

export function getAllHostNames(): string[] {
  return [HOST_NAME, ...LEGACY_HOST_NAMES];
}

function getWrapperScriptNames(): string[] {
  const ext = process.platform === 'win32' ? '.bat' : '.sh';
  return [WRAPPER_SCRIPT_BASENAME, ...LEGACY_WRAPPER_SCRIPT_BASENAMES].map(
    (baseName) => `${baseName}${ext}`,
  );
}

/**
 * Get native host startup script file path
 */
export async function getMainPath(): Promise<string> {
  try {
    const packageDistDir = path.join(__dirname, '..');
    for (const wrapperScriptName of getWrapperScriptNames()) {
      const absoluteWrapperPath = path.resolve(packageDistDir, wrapperScriptName);
      if (fs.existsSync(absoluteWrapperPath)) {
        return absoluteWrapperPath;
      }
    }

    const absoluteWrapperPath = path.resolve(packageDistDir, getWrapperScriptNames()[0]);
    return absoluteWrapperPath;
  } catch (error) {
    console.log(colorText('Cannot find global package path, using current directory', 'yellow'));
    throw error;
  }
}

/**
 * 确保关键文件具有执行权限
 */
export async function ensureExecutionPermissions(): Promise<void> {
  try {
    const packageDistDir = path.join(__dirname, '..');

    if (process.platform === 'win32') {
      // Windows 平台处理
      await ensureWindowsFilePermissions(packageDistDir);
      return;
    }

    // Unix/Linux 平台处理
    const filesToCheck = [
      path.join(packageDistDir, 'index.js'),
      ...getWrapperScriptNames().map((fileName) => path.join(packageDistDir, fileName)),
      path.join(packageDistDir, 'cli.js'),
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
  } catch (error: any) {
    console.warn(colorText(`⚠️ Error ensuring execution permissions: ${error.message}`, 'yellow'));
  }
}

/**
 * Windows 平台文件权限处理
 */
async function ensureWindowsFilePermissions(packageDistDir: string): Promise<void> {
  const filesToCheck = [
    path.join(packageDistDir, 'index.js'),
    ...getWrapperScriptNames().map((fileName) => path.join(packageDistDir, fileName)),
    path.join(packageDistDir, 'cli.js'),
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

/**
 * Create Native Messaging host manifest content
 */
export async function createManifestContent(hostName: string = HOST_NAME): Promise<any> {
  const mainPath = await getMainPath();
  const extraExtensionIds = (process.env[EXTRA_EXTENSION_IDS_ENV] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedOrigins = Array.from(
    new Set([EXTENSION_ID, EXTENSION_ID_WEBSTORE, ...extraExtensionIds]),
  ).map((extensionId) => `chrome-extension://${extensionId}/`);

  return {
    name: hostName,
    description: DESCRIPTION,
    path: mainPath, // Node.js可执行文件路径
    type: 'stdio',
    allowed_origins: allowedOrigins,
  };
}

/**
 * 验证Windows注册表项是否存在
 */
function verifyWindowsRegistryEntry(registryKey: string, expectedPath: string): boolean {
  if (os.platform() !== 'win32') {
    return true; // 非Windows平台跳过验证
  }

  try {
    const result = execSync(`reg query "${registryKey}" /ve`, { encoding: 'utf8', stdio: 'pipe' });
    const lines = result.split('\n');
    for (const line of lines) {
      if (line.includes('REG_SZ') && line.includes(expectedPath.replace(/\\/g, '\\\\'))) {
        return true;
      }
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * 尝试注册用户级别的Native Messaging主机
 */
export async function tryRegisterUserLevelHost(targetBrowsers?: BrowserType[]): Promise<boolean> {
  try {
    console.log(colorText('Attempting to register user-level Native Messaging host...', 'blue'));

    // 1. 确保执行权限
    await ensureExecutionPermissions();

    // 2. 确定要注册的浏览器
    const browsersToRegister = targetBrowsers || detectInstalledBrowsers();
    if (browsersToRegister.length === 0) {
      // 如果没有检测到浏览器，默认注册Chrome、Canary和Chromium
      browsersToRegister.push(BrowserType.CHROME, BrowserType.CANARY, BrowserType.CHROMIUM);
      console.log(
        colorText(
          'No browsers detected, registering for Chrome, Canary and Chromium by default',
          'yellow',
        ),
      );
    } else {
      console.log(colorText(`Detected browsers: ${browsersToRegister.join(', ')}`, 'blue'));
    }

    // 3. 创建清单内容
    const hostNames = getAllHostNames();

    let successCount = 0;
    const results: { browser: string; success: boolean; error?: string }[] = [];

    // 4. 为每个浏览器注册
    for (const browserType of browsersToRegister) {
      const config = getBrowserConfig(browserType);
      console.log(colorText(`\nRegistering for ${config.displayName}...`, 'blue'));

      try {
        for (const hostName of hostNames) {
          const hostConfig = getBrowserConfig(browserType, hostName);
          const manifest = await createManifestContent(hostName);

          await mkdir(path.dirname(hostConfig.userManifestPath), { recursive: true });
          await writeFile(hostConfig.userManifestPath, JSON.stringify(manifest, null, 2));
          console.log(colorText(`✓ Manifest written to ${hostConfig.userManifestPath}`, 'green'));

          if (os.platform() === 'win32' && hostConfig.registryKey) {
            try {
              const escapedPath = hostConfig.userManifestPath.replace(/\\/g, '\\\\');
              const regCommand = `reg add "${hostConfig.registryKey}" /ve /t REG_SZ /d "${escapedPath}" /f`;
              execSync(regCommand, { stdio: 'pipe' });

              if (verifyWindowsRegistryEntry(hostConfig.registryKey, hostConfig.userManifestPath)) {
                console.log(
                  colorText(
                    `✓ Registry entry created for ${config.displayName} (${hostName})`,
                    'green',
                  ),
                );
              } else {
                throw new Error('Registry verification failed');
              }
            } catch (error: any) {
              throw new Error(`Registry error for ${hostName}: ${error.message}`);
            }
          }
        }

        successCount++;
        results.push({ browser: config.displayName, success: true });
        console.log(colorText(`✓ Successfully registered ${config.displayName}`, 'green'));
      } catch (error: any) {
        results.push({ browser: config.displayName, success: false, error: error.message });
        console.log(
          colorText(`✗ Failed to register ${config.displayName}: ${error.message}`, 'red'),
        );
      }
    }

    // 5. 报告结果
    console.log(colorText('\n===== Registration Summary =====', 'blue'));
    for (const result of results) {
      if (result.success) {
        console.log(colorText(`✓ ${result.browser}: Success`, 'green'));
      } else {
        console.log(colorText(`✗ ${result.browser}: Failed - ${result.error}`, 'red'));
      }
    }

    return successCount > 0;
  } catch (error) {
    console.log(
      colorText(
        `User-level registration failed: ${error instanceof Error ? error.message : String(error)}`,
        'yellow',
      ),
    );
    return false;
  }
}

// 导入is-admin包（仅在Windows平台使用）
let isAdmin: () => boolean = () => false;
if (process.platform === 'win32') {
  try {
    isAdmin = require('is-admin');
  } catch (error) {
    console.warn('缺少is-admin依赖，Windows平台下可能无法正确检测管理员权限');
    console.warn(error);
  }
}

/**
 * 使用提升权限注册系统级清单
 */
export async function registerWithElevatedPermissions(): Promise<void> {
  try {
    console.log(colorText('Attempting to register system-level manifest...', 'blue'));

    // 1. 确保执行权限
    await ensureExecutionPermissions();

    // 2. 准备清单内容
    const hostNames = getAllHostNames();

    // 5. 检测是否已经有管理员权限
    const isRoot = process.getuid && process.getuid() === 0; // Unix/Linux/Mac
    const hasAdminRights = process.platform === 'win32' ? isAdmin() : false; // Windows平台检测管理员权限
    const hasElevatedPermissions = isRoot || hasAdminRights;

    if (hasElevatedPermissions) {
      try {
        for (const hostName of hostNames) {
          const manifest = await createManifestContent(hostName);
          const manifestPath = getSystemManifestPath(hostName);
          const tempManifestPath = path.join(os.tmpdir(), `${hostName}.json`);
          await writeFile(tempManifestPath, JSON.stringify(manifest, null, 2));

          if (!fs.existsSync(path.dirname(manifestPath))) {
            fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
          }

          fs.copyFileSync(tempManifestPath, manifestPath);

          if (os.platform() !== 'win32') {
            fs.chmodSync(manifestPath, '644');
          }

          if (os.platform() === 'win32') {
            const registryKey = `HKLM\\Software\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`;
            const escapedPath = manifestPath.replace(/\\/g, '\\\\');
            const regCommand = `reg add "${registryKey}" /ve /t REG_SZ /d "${escapedPath}" /f`;
            execSync(regCommand, { stdio: 'pipe' });

            if (verifyWindowsRegistryEntry(registryKey, manifestPath)) {
              console.log(
                colorText(`Windows registry entry created successfully for ${hostName}!`, 'green'),
              );
            } else {
              console.log(
                colorText(
                  `⚠️ Registry entry created but verification failed for ${hostName}`,
                  'yellow',
                ),
              );
            }
          }
        }

        console.log(colorText('System-level manifest registration successful!', 'green'));
      } catch (error: any) {
        console.error(
          colorText(`System-level manifest installation failed: ${error.message}`, 'red'),
        );
        throw error;
      }
    } else {
      // 没有管理员权限，打印手动操作提示
      console.log(
        colorText('⚠️ Administrator privileges required for system-level installation', 'yellow'),
      );
      console.log(
        colorText(
          'Please run one of the following commands with administrator privileges:',
          'blue',
        ),
      );

      if (os.platform() === 'win32') {
        console.log(colorText('  1. Open Command Prompt as Administrator and run:', 'blue'));
        console.log(colorText(`     ${COMMAND_NAME} register --system`, 'cyan'));
      } else {
        console.log(colorText('  1. Run with sudo:', 'blue'));
        console.log(colorText(`     sudo ${COMMAND_NAME} register`, 'cyan'));
      }

      console.log(
        colorText('  2. Or run the registration command with elevated privileges:', 'blue'),
      );
      console.log(colorText(`     sudo ${COMMAND_NAME} register --system`, 'cyan'));

      throw new Error('Administrator privileges required for system-level installation');
    }
  } catch (error: any) {
    console.error(colorText(`注册失败: ${error.message}`, 'red'));
    throw error;
  }
}
