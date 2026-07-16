import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import {
  COMMAND_NAME,
  EXTENSION_ID,
  EXTENSION_ID_WEBSTORE,
  EXTRA_EXTENSION_IDS_ENV,
  HOST_NAME,
  LEGACY_WRAPPER_SCRIPT_BASENAMES,
  LEGACY_HOST_NAMES,
  WRAPPER_SCRIPT_BASENAME,
} from './constant';
import { BrowserType, detectInstalledBrowsers, getBrowserConfig } from './browser-config';
import { colorText, ensureExecutionPermissions, getAllHostNames, getMainPath } from './utils';

type CheckStatus = 'ok' | 'warn' | 'error' | 'info';

interface DoctorCheck {
  status: CheckStatus;
  label: string;
  detail?: string;
}

export interface DoctorOptions {
  browser?: BrowserType | 'all';
  fix?: boolean;
  json?: boolean;
}

export interface DoctorResult {
  ok: boolean;
  errorCount: number;
  warningCount: number;
  checks: DoctorCheck[];
  suggestions: string[];
}

interface NativeManifest {
  name?: string;
  description?: string;
  path?: string;
  type?: string;
  allowed_origins?: string[];
}

interface ManifestValidationResult {
  exists: boolean;
  valid: boolean;
  path: string;
  scope: 'user' | 'system';
  issues: string[];
}

interface ManifestPairResult {
  exists: boolean;
  valid: boolean;
}

function addCheck(
  checks: DoctorCheck[],
  status: CheckStatus,
  label: string,
  detail?: string,
): void {
  checks.push({ status, label, detail });
}

function getStatusText(status: CheckStatus): string {
  switch (status) {
    case 'ok':
      return colorText('[ok]', 'green');
    case 'warn':
      return colorText('[warn]', 'yellow');
    case 'error':
      return colorText('[error]', 'red');
    case 'info':
      return colorText('[info]', 'blue');
  }
}

function getPackageDistDir(): string {
  return path.join(__dirname, '..');
}

function getPackageRootDir(): string {
  return path.join(__dirname, '..', '..');
}

function getPackageVersion(): string {
  try {
    return require('../../package.json').version;
  } catch {
    return 'unknown';
  }
}

function getWrapperScriptNames(): string[] {
  const extension = process.platform === 'win32' ? '.bat' : '.sh';
  return [WRAPPER_SCRIPT_BASENAME, ...LEGACY_WRAPPER_SCRIPT_BASENAMES].map(
    (baseName) => `${baseName}${extension}`,
  );
}

function canExecute(stats: fs.Stats): boolean {
  return Boolean(stats.mode & 0o111);
}

function readJsonFile(filePath: string): { data?: NativeManifest; error?: string } {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return { data: JSON.parse(raw) };
  } catch (error: any) {
    return { error: error.message };
  }
}

function isPathInside(childPath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function getExpectedExtensionIds(): string[] {
  const extraExtensionIds = (process.env[EXTRA_EXTENSION_IDS_ENV] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set([EXTENSION_ID, EXTENSION_ID_WEBSTORE, ...extraExtensionIds]));
}

function checkNodePath(checks: DoctorCheck[], suggestions: string[], fix: boolean): void {
  const nodePathFile = path.join(getPackageDistDir(), 'node_path.txt');

  if (fix) {
    try {
      fs.writeFileSync(nodePathFile, process.execPath, 'utf8');
      addCheck(checks, 'ok', 'Node path file updated', nodePathFile);
    } catch (error: any) {
      addCheck(checks, 'error', 'Failed to update node_path.txt', error.message);
      suggestions.push(`Run ${COMMAND_NAME} doctor --fix from a writable installation.`);
      return;
    }
  }

  if (!fs.existsSync(nodePathFile)) {
    addCheck(checks, 'warn', 'Node path file is missing', nodePathFile);
    suggestions.push(`Run ${COMMAND_NAME} doctor --fix to write node_path.txt.`);
    return;
  }

  const configuredNodePath = fs.readFileSync(nodePathFile, 'utf8').trim();
  if (!configuredNodePath) {
    addCheck(checks, 'warn', 'Node path file is empty', nodePathFile);
    suggestions.push(`Run ${COMMAND_NAME} doctor --fix to refresh node_path.txt.`);
    return;
  }

  if (!fs.existsSync(configuredNodePath)) {
    addCheck(checks, 'warn', 'Configured Node.js path does not exist', configuredNodePath);
    suggestions.push(`Run ${COMMAND_NAME} doctor --fix after switching Node.js versions.`);
    return;
  }

  addCheck(checks, 'ok', 'Configured Node.js path exists', configuredNodePath);
}

async function checkPackageFiles(
  checks: DoctorCheck[],
  suggestions: string[],
  fix: boolean,
): Promise<void> {
  const packageDistDir = getPackageDistDir();
  const filesToCheck = [
    path.join(packageDistDir, 'index.js'),
    path.join(packageDistDir, 'cli.js'),
    ...getWrapperScriptNames().map((fileName) => path.join(packageDistDir, fileName)),
  ];

  if (fix) {
    await ensureExecutionPermissions();
  }

  for (const filePath of filesToCheck) {
    if (!fs.existsSync(filePath)) {
      addCheck(checks, 'error', 'Required runtime file is missing', filePath);
      suggestions.push('Reinstall the global mcp-chrome-bridger package.');
      continue;
    }

    const stats = fs.statSync(filePath);
    if (process.platform !== 'win32' && filePath.endsWith('.sh') && !canExecute(stats)) {
      addCheck(checks, 'error', 'Wrapper script is not executable', filePath);
      suggestions.push(`Run ${COMMAND_NAME} fix-permissions or ${COMMAND_NAME} doctor --fix.`);
      continue;
    }

    addCheck(checks, 'ok', 'Runtime file exists', filePath);
  }
}

function checkLogsDirectory(checks: DoctorCheck[], suggestions: string[], fix: boolean): void {
  const logsDir = path.join(getPackageDistDir(), 'logs');

  if (fix && !fs.existsSync(logsDir)) {
    try {
      fs.mkdirSync(logsDir, { recursive: true });
      addCheck(checks, 'ok', 'Logs directory created', logsDir);
    } catch (error: any) {
      addCheck(checks, 'error', 'Failed to create logs directory', error.message);
      suggestions.push(`Create ${logsDir} and make it writable by the current user.`);
      return;
    }
  }

  if (!fs.existsSync(logsDir)) {
    addCheck(checks, 'warn', 'Logs directory is missing', logsDir);
    suggestions.push(`Run ${COMMAND_NAME} doctor --fix to create the logs directory.`);
    return;
  }

  try {
    fs.accessSync(logsDir, fs.constants.W_OK);
    addCheck(checks, 'ok', 'Logs directory is writable', logsDir);
  } catch (error: any) {
    addCheck(checks, 'error', 'Logs directory is not writable', error.message);
    suggestions.push(`Fix write permissions for ${logsDir}.`);
  }
}

function validateManifest(
  manifestPath: string,
  scope: 'user' | 'system',
  expectedHostName: string,
): ManifestValidationResult {
  if (!fs.existsSync(manifestPath)) {
    return { exists: false, valid: false, path: manifestPath, scope, issues: [] };
  }

  const { data: manifest, error } = readJsonFile(manifestPath);
  if (!manifest) {
    return {
      exists: true,
      valid: false,
      path: manifestPath,
      scope,
      issues: [`invalid JSON: ${error}`],
    };
  }

  const issues: string[] = [];

  if (manifest.name !== expectedHostName) {
    issues.push(`expected name ${expectedHostName}, got ${manifest.name || '(missing)'}`);
  }

  if (manifest.type !== 'stdio') {
    issues.push(`expected type stdio, got ${manifest.type || '(missing)'}`);
  }

  if (!manifest.path) {
    issues.push('path is missing');
  } else {
    const absoluteManifestPath = path.resolve(manifest.path);
    if (!fs.existsSync(absoluteManifestPath)) {
      issues.push(`path does not exist: ${absoluteManifestPath}`);
    }
  }

  const allowedOrigins = Array.isArray(manifest.allowed_origins) ? manifest.allowed_origins : [];
  if (!Array.isArray(manifest.allowed_origins)) {
    issues.push('allowed_origins is missing or invalid');
  }

  for (const extensionId of getExpectedExtensionIds()) {
    const expectedOrigin = `chrome-extension://${extensionId}/`;
    if (!allowedOrigins.includes(expectedOrigin)) {
      issues.push(`missing extension origin ${expectedOrigin}`);
    }
  }

  return {
    exists: true,
    valid: issues.length === 0,
    path: manifestPath,
    scope,
    issues,
  };
}

function getManifestRuntimePath(manifestPath: string): string | undefined {
  const { data: manifest } = readJsonFile(manifestPath);
  return manifest?.path ? path.resolve(manifest.path) : undefined;
}

function checkManifestPair(
  checks: DoctorCheck[],
  suggestions: string[],
  browserType: BrowserType,
  hostName: string,
  options: { suppressMissing?: boolean } = {},
): ManifestPairResult {
  const browserConfig = getBrowserConfig(browserType, hostName);
  const hostLabel = hostName === HOST_NAME ? 'manifest' : `legacy manifest (${hostName})`;
  const userResult = validateManifest(browserConfig.userManifestPath, 'user', hostName);
  const systemResult = validateManifest(browserConfig.systemManifestPath, 'system', hostName);
  const existingResults = [userResult, systemResult].filter((result) => result.exists);
  const validResults = existingResults.filter((result) => result.valid);

  if (existingResults.length === 0) {
    if (!options.suppressMissing) {
      addCheck(
        checks,
        'warn',
        `${browserConfig.displayName} ${hostLabel} not found`,
        `user=${browserConfig.userManifestPath}; system=${browserConfig.systemManifestPath}`,
      );
      suggestions.push(`Run ${COMMAND_NAME} register -b ${browserType}.`);
    }
    return { exists: false, valid: false };
  }

  if (validResults.length > 0) {
    const manifestPaths = validResults.map((result) => `${result.scope}=${result.path}`).join('; ');
    addCheck(checks, 'ok', `${browserConfig.displayName} ${hostLabel} is valid`, manifestPaths);

    const packageDistDir = path.resolve(getPackageDistDir());
    for (const result of validResults) {
      const runtimePath = getManifestRuntimePath(result.path);
      if (
        runtimePath &&
        !isPathInside(runtimePath, packageDistDir) &&
        runtimePath !== packageDistDir
      ) {
        addCheck(
          checks,
          'warn',
          `${browserConfig.displayName} ${hostLabel} points outside current package`,
          `${result.scope}=${runtimePath}`,
        );
        suggestions.push(`Run ${COMMAND_NAME} register -b ${browserType} if this is stale.`);
      }
    }
  }

  const invalidResults = existingResults.filter((result) => !result.valid);
  for (const result of invalidResults) {
    const status = validResults.length > 0 ? 'warn' : 'error';
    addCheck(
      checks,
      status,
      `${browserConfig.displayName} ${result.scope} ${hostLabel} is invalid`,
      result.issues.join('; '),
    );
    suggestions.push(`Run ${COMMAND_NAME} register -b ${browserType}.`);
  }

  return { exists: true, valid: validResults.length > 0 };
}

function getTargetBrowsers(browser?: BrowserType | 'all'): BrowserType[] {
  if (browser === 'all') {
    return Object.values(BrowserType);
  }

  if (browser) {
    return [browser];
  }

  const detectedBrowsers = detectInstalledBrowsers();
  return detectedBrowsers.length > 0 ? detectedBrowsers : [BrowserType.CHROME];
}

function checkBrowsersAndManifests(
  checks: DoctorCheck[],
  suggestions: string[],
  browser?: BrowserType | 'all',
): void {
  const detectedBrowsers = detectInstalledBrowsers();
  if (detectedBrowsers.length > 0) {
    addCheck(checks, 'ok', 'Detected browsers', detectedBrowsers.join(', '));
  } else {
    addCheck(checks, 'warn', 'No supported browsers detected');
    suggestions.push(`Use ${COMMAND_NAME} doctor -b all to inspect all manifest locations.`);
  }

  const browsersToCheck = getTargetBrowsers(browser);
  for (const browserType of browsersToCheck) {
    const primaryResult = checkManifestPair(checks, suggestions, browserType, HOST_NAME);
    if (primaryResult.valid) {
      continue;
    }

    for (const hostName of LEGACY_HOST_NAMES) {
      checkManifestPair(checks, suggestions, browserType, hostName, { suppressMissing: true });
    }
  }
}

function checkWindowsRegistry(checks: DoctorCheck[], browser?: BrowserType | 'all'): void {
  if (process.platform !== 'win32') {
    return;
  }

  const browsersToCheck = getTargetBrowsers(browser);
  for (const browserType of browsersToCheck) {
    for (const hostName of getAllHostNames()) {
      const browserConfig = getBrowserConfig(browserType, hostName);
      for (const [scope, registryKey] of [
        ['user', browserConfig.registryKey],
        ['system', browserConfig.systemRegistryKey],
      ] as Array<['user' | 'system', string | undefined]>) {
        if (!registryKey) continue;

        try {
          const result = execSync(`reg query "${registryKey}" /ve`, {
            encoding: 'utf8',
            stdio: 'pipe',
          });
          addCheck(
            checks,
            'ok',
            `${browserConfig.displayName} ${scope} registry key exists`,
            result.trim(),
          );
        } catch {
          addCheck(
            checks,
            scope === 'user' ? 'warn' : 'info',
            `${browserConfig.displayName} ${scope} registry key not found`,
            registryKey,
          );
        }
      }
    }
  }
}

function printHumanResult(result: DoctorResult): void {
  console.log(colorText('Doctor report', 'blue'));
  console.log('');

  for (const check of result.checks) {
    const detail = check.detail ? ` - ${check.detail}` : '';
    console.log(`${getStatusText(check.status)} ${check.label}${detail}`);
  }

  console.log('');
  if (result.errorCount === 0 && result.warningCount === 0) {
    console.log(colorText('No problems found.', 'green'));
  } else {
    console.log(
      colorText(
        `Found ${result.errorCount} error(s) and ${result.warningCount} warning(s).`,
        result.errorCount > 0 ? 'red' : 'yellow',
      ),
    );
  }

  const uniqueSuggestions = Array.from(new Set(result.suggestions));
  if (uniqueSuggestions.length > 0) {
    console.log('');
    console.log(colorText('Suggested next steps:', 'blue'));
    for (const suggestion of uniqueSuggestions) {
      console.log(`- ${suggestion}`);
    }
  }
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const suggestions: string[] = [];

  addCheck(checks, 'info', 'Package version', getPackageVersion());
  addCheck(checks, 'info', 'Platform', `${process.platform} ${os.release()} (${process.arch})`);
  addCheck(checks, 'info', 'Node.js runtime', `${process.version} at ${process.execPath}`);
  addCheck(checks, 'info', 'Package root', getPackageRootDir());

  try {
    const mainPath = await getMainPath();
    addCheck(checks, 'ok', 'Native host entrypoint resolved', mainPath);
  } catch (error: any) {
    addCheck(checks, 'error', 'Failed to resolve native host entrypoint', error.message);
    suggestions.push('Reinstall the global mcp-chrome-bridger package.');
  }

  await checkPackageFiles(checks, suggestions, Boolean(options.fix));
  checkNodePath(checks, suggestions, Boolean(options.fix));
  checkLogsDirectory(checks, suggestions, Boolean(options.fix));
  checkBrowsersAndManifests(checks, suggestions, options.browser);
  checkWindowsRegistry(checks, options.browser);

  if (options.fix) {
    suggestions.push('Restart Chrome completely after registration or permission changes.');
  }

  const errorCount = checks.filter((check) => check.status === 'error').length;
  const warningCount = checks.filter((check) => check.status === 'warn').length;
  const result = {
    ok: errorCount === 0,
    errorCount,
    warningCount,
    checks,
    suggestions: Array.from(new Set(suggestions)),
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanResult(result);
  }

  return result;
}
