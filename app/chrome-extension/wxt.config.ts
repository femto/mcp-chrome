import { defineConfig } from 'wxt';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '.env.local') });

// Default extension key for consistent extension ID across builds
// This produces extension ID: gkgkeiahoaihgefckmjckmennckgaege
const DEFAULT_EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuw17tqGmCW4q/+TSJKySEix2JmRi4GuF4OJgXbD0dJ4EhmohxQIQ5JO0pF7qmrcsX+d6QHY2E+RQy2Vf3UuFdQNBHIozbe8Lr5Yu1t0pp2IT4XPrCqNiv2JHUVTj5N9e9veiO6EOMPSzBnsaSf47cr1rfZLop5hHLYOUHIKT7g+6DEucmaO3LtJ21kVioK1tUccC/FJQu4HOveBUtRkT0pGJPYO+Bi7DmKgSfcdjtAU2QqaTYKTDzyYnHKYNLdfFj60W+0Hc3kHb1tODueAWF1TEIeMGhbjXKlmMJGpi7GQOYE1wlyBQ+wz3OLPk+9bdFCtqKsukZinoLAg/S5N/QQIDAQAB';
const CHROME_EXTENSION_KEY = process.env.CHROME_EXTENSION_KEY || DEFAULT_EXTENSION_KEY;

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  runner: {
    // 方案1: 禁用自动启动（推荐）
    disabled: true,

    // 方案2: 如果要启用自动启动并使用现有配置，取消注释下面的配置
    // chromiumArgs: [
    //   '--user-data-dir=' + homedir() + (process.platform === 'darwin'
    //     ? '/Library/Application Support/Google/Chrome'
    //     : process.platform === 'win32'
    //     ? '/AppData/Local/Google/Chrome/User Data'
    //     : '/.config/google-chrome'),
    //   '--remote-debugging-port=9222',
    // ],
  },
  manifest: {
    // Use environment variable for the key, fallback to undefined if not set
    key: CHROME_EXTENSION_KEY,
    default_locale: 'zh_CN',
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    permissions: [
      'nativeMessaging',
      'tabs',
      'activeTab',
      'scripting',
      'downloads',
      'webRequest',
      'debugger',
      'history',
      'bookmarks',
      'offscreen',
      'storage',
    ],
    host_permissions: ['<all_urls>'],
    web_accessible_resources: [
      {
        resources: [
          '/models/*', // 允许访问 public/models/ 下的所有文件
          '/workers/*', // 允许访问 workers 文件
        ],
        matches: ['<all_urls>'],
      },
    ],
    cross_origin_embedder_policy: {
      value: 'require-corp',
    },
    cross_origin_opener_policy: {
      value: 'same-origin',
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
  vite: (env) => ({
    plugins: [
      viteStaticCopy({
        targets: [
          {
            src: 'inject-scripts/*.js',
            dest: 'inject-scripts',
          },
          {
            src: ['workers/*'],
            dest: 'workers',
          },
          {
            src: '_locales/**/*',
            dest: '_locales',
          },
        ],
        structured: false,
        hook: 'writeBundle',
      }) as any,
    ],
    build: {
      // 我们的构建产物需要兼容到es6
      target: 'es2015',
      // 非生产环境下生成sourcemap
      sourcemap: env.mode !== 'production',
      // 禁用gzip 压缩大小报告，因为压缩大型文件可能会很慢
      reportCompressedSize: false,
      // chunk大小超过1500kb是触发警告
      chunkSizeWarningLimit: 1500,
      minify: false,
    },
  }),
});
