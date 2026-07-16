import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { COMMAND_NAME, LEGACY_WRAPPER_SCRIPT_BASENAMES, WRAPPER_SCRIPT_BASENAME } from './constant';

const distDir = path.join(__dirname, '..', '..', 'dist');
// 清理上次构建
console.log('清理上次构建...');
try {
  fs.rmSync(distDir, { recursive: true, force: true });
} catch (err) {
  // 忽略目录不存在的错误
  console.log(err);
}

// 创建dist目录
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(path.join(distDir, 'logs'), { recursive: true }); // 创建logs目录
fs.writeFileSync(path.join(distDir, 'logs', '.gitkeep'), '');
console.log('dist 和 dist/logs 目录已创建/确认存在');

// 编译TypeScript
console.log('编译TypeScript...');
execSync('tsc', { stdio: 'inherit' });

// 复制配置文件
console.log('复制配置文件...');
const configSourcePath = path.join(__dirname, '..', 'mcp', 'stdio-config.json');
const configDestPath = path.join(distDir, 'mcp', 'stdio-config.json');

try {
  // 确保目标目录存在
  fs.mkdirSync(path.dirname(configDestPath), { recursive: true });

  if (fs.existsSync(configSourcePath)) {
    fs.copyFileSync(configSourcePath, configDestPath);
    console.log(`已将 stdio-config.json 复制到 ${configDestPath}`);
  } else {
    console.error(`错误: 配置文件未找到: ${configSourcePath}`);
  }
} catch (error) {
  console.error('复制配置文件时出错:', error);
}

// 复制package.json并更新其内容
console.log('准备package.json...');
const packageJson = require('../../package.json');

// Create install README
const readmeContent = `# ${packageJson.name}

This package provides the native messaging host used by the Chrome extension.

## Installation

1. Make sure Node.js is installed.
2. Install the package globally:
   \`\`\`
   npm install -g ${packageJson.name}
   \`\`\`
3. Register the native messaging host explicitly:
   \`\`\`
   # User-level registration (recommended)
   ${COMMAND_NAME} register

   # Verify the installation
   ${COMMAND_NAME} doctor

   # If user-level registration fails, try system-level registration
   ${COMMAND_NAME} register --system

   # Or run with elevated privileges
   sudo ${COMMAND_NAME} register
   \`\`\`

Do not rely on install-time \`postinstall\` behavior. npm v12+ and pnpm can skip dependency lifecycle scripts unless scripts are explicitly allowed. If you intentionally want npm to run install-time registration, use:

\`\`\`
npm install -g --allow-scripts=${packageJson.name} ${packageJson.name}
\`\`\`

## Compatibility

- The npm package name remains \`mcp-chrome-bridger\`
- Registration writes both the new and legacy native host names
- Build output contains both the new and legacy wrapper script names

## Usage

The Chrome extension starts this native host automatically. You do not run the server directly.
`;

fs.writeFileSync(path.join(distDir, 'README.md'), readmeContent);

console.log('复制包装脚本...');
const scriptsSourceDir = path.join(__dirname, '.');
const macOsWrapperSourcePath = path.join(scriptsSourceDir, 'run_host.sh');
const windowsWrapperSourcePath = path.join(scriptsSourceDir, 'run_host.bat');
const wrapperBaseNames = [WRAPPER_SCRIPT_BASENAME, ...LEGACY_WRAPPER_SCRIPT_BASENAMES];

try {
  if (!fs.existsSync(macOsWrapperSourcePath)) {
    console.error(`错误: macOS 包装脚本源文件未找到: ${macOsWrapperSourcePath}`);
  } else {
    for (const wrapperBaseName of wrapperBaseNames) {
      const destinationPath = path.join(distDir, `${wrapperBaseName}.sh`);
      fs.copyFileSync(macOsWrapperSourcePath, destinationPath);
      console.log(`已将 ${macOsWrapperSourcePath} 复制到 ${destinationPath}`);
    }
  }

  if (!fs.existsSync(windowsWrapperSourcePath)) {
    console.error(`错误: Windows 包装脚本源文件未找到: ${windowsWrapperSourcePath}`);
  } else {
    for (const wrapperBaseName of wrapperBaseNames) {
      const destinationPath = path.join(distDir, `${wrapperBaseName}.bat`);
      fs.copyFileSync(windowsWrapperSourcePath, destinationPath);
      console.log(`已将 ${windowsWrapperSourcePath} 复制到 ${destinationPath}`);
    }
  }
} catch (error) {
  console.error('复制包装脚本时出错:', error);
}

// 为关键JavaScript文件和macOS包装脚本添加可执行权限
console.log('添加可执行权限...');
const filesToMakeExecutable = [
  'index.js',
  'cli.js',
  ...wrapperBaseNames.map((wrapperBaseName) => `${wrapperBaseName}.sh`),
];

filesToMakeExecutable.forEach((file) => {
  const filePath = path.join(distDir, file); // filePath 现在是目标路径
  try {
    if (fs.existsSync(filePath)) {
      fs.chmodSync(filePath, '755');
      console.log(`已为 ${file} 添加可执行权限 (755)`);
    } else {
      console.warn(`警告: ${filePath} 不存在，无法添加可执行权限`);
    }
  } catch (error) {
    console.error(`为 ${file} 添加可执行权限时出错:`, error);
  }
});

console.log('✅ 构建完成');
