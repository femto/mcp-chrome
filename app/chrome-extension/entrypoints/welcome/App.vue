<template>
  <div class="page">
    <header class="header">
      <div class="brand">
        <div class="logo">
          <svg
            viewBox="0 0 24 24"
            width="28"
            height="28"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
        <div>
          <h1>Chrome MCP Server</h1>
          <p class="muted">After the extension is installed, this is the only required step.</p>
        </div>
      </div>
      <a class="docs-btn" :href="TROUBLESHOOTING_URL" target="_blank" rel="noopener"
        >Troubleshooting Docs</a
      >
    </header>

    <main class="main">
      <section class="card">
        <h2
          >Install <code class="title-code">{{ PACKAGE }}</code></h2
        >
        <p class="muted"
          >The Chrome extension uses this local bridge to expose MCP tools to your client.</p
        >

        <div class="cmd primary">
          <code>{{ installCmds.npm }}</code>
          <button @click="copy('npm', installCmds.npm)">{{ label('npm') }}</button>
        </div>

        <div class="cmd-grid">
          <div class="cmd alt">
            <div>
              <div class="cmd-tag">PNPM</div>
              <code>{{ installCmds.pnpm }}</code>
            </div>
            <button @click="copy('pnpm', installCmds.pnpm)">{{ label('pnpm') }}</button>
          </div>
          <div class="cmd alt">
            <div>
              <div class="cmd-tag">YARN</div>
              <code>{{ installCmds.yarn }}</code>
            </div>
            <button @click="copy('yarn', installCmds.yarn)">{{ label('yarn') }}</button>
          </div>
        </div>

        <p class="muted step">Then register the native host with Chrome:</p>
        <div class="cmd primary">
          <code>{{ registerCmd }}</code>
          <button @click="copy('register', registerCmd)">{{ label('register') }}</button>
        </div>

        <div class="note"
          >Requires Node.js 18.19+. Check your version with
          <code class="inline">node -v</code>.</div
        >

        <hr />

        <h3>MCP client URL (streamable HTTP)</h3>
        <p class="muted"
          >Use this URL in your MCP client (e.g., Claude Desktop, Claude Code, CherryStudio).</p
        >
        <div class="cmd primary">
          <code>{{ mcpUrl }}</code>
          <button @click="copy('url', mcpUrl)">{{ label('url') }}</button>
        </div>
        <p class="tip"
          >Tip: You can also open the extension popup and click "Connect" to copy a full client
          config snippet.</p
        >
      </section>

      <section class="card trouble">
        <div>
          <h3>Troubleshooting</h3>
          <p class="muted">
            Use this only if the bridge fails to register or connect. See the
            <a class="link" :href="TROUBLESHOOTING_URL" target="_blank" rel="noopener"
              >troubleshooting guide</a
            >
            for more fixes.
          </p>
        </div>
        <div class="cmd primary compact">
          <code>{{ doctorCmd }}</code>
          <button @click="copy('doctor', doctorCmd)">{{ label('doctor') }}</button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

const PACKAGE = 'mcp-chrome-bridger';
const TROUBLESHOOTING_URL =
  'https://github.com/femto/mcp-chrome/blob/master/docs/TROUBLESHOOTING.md';

const installCmds = {
  npm: `npm install -g ${PACKAGE}`,
  pnpm: `pnpm add -g ${PACKAGE}`,
  yarn: `yarn global add ${PACKAGE}`,
};
const registerCmd = `${PACKAGE} register`;
const doctorCmd = `${PACKAGE} doctor`;

const port = ref(12306);
const mcpUrl = computed(() => `http://127.0.0.1:${port.value}/mcp`);

const copied = reactive<Record<string, boolean>>({});
const label = (key: string) => (copied[key] ? 'Copied' : 'Copy');

async function copy(key: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied[key] = true;
    setTimeout(() => (copied[key] = false), 1500);
  } catch (error) {
    console.warn('Welcome: copy failed', error);
  }
}

onMounted(async () => {
  try {
    const result = await chrome.storage.local.get(['nativeServerPort']);
    if (typeof result.nativeServerPort === 'number') port.value = result.nativeServerPort;
  } catch {
    // keep default port
  }
});
</script>

<style>
:root {
  --bg: #faf9f5;
  --card: #ffffff;
  --border: #e6e3da;
  --soft: #f0efea;
  --text: #1f1e1b;
  --muted: #6b6a65;
  --accent: #d97757;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --serif: Georgia, 'Times New Roman', serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1f1e1b;
    --card: #2a2925;
    --border: #3a3934;
    --soft: #33322d;
    --text: #f0efea;
    --muted: #a8a69e;
  }
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  line-height: 1.5;
}
</style>

<style scoped>
.page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 16px 48px;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 28px 0;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.brand {
  display: flex;
  align-items: center;
  gap: 16px;
}
.logo {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--accent);
  display: grid;
  place-items: center;
}
h1,
h2,
h3 {
  font-family: var(--serif);
  font-weight: 500;
  margin: 0;
}
h1 {
  font-size: 22px;
}
h2 {
  font-size: 26px;
  margin-bottom: 6px;
}
h3 {
  font-size: 18px;
  margin-bottom: 4px;
}
.muted {
  color: var(--muted);
  margin: 0;
}
.docs-btn {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--text);
  text-decoration: none;
  border: 1px solid var(--border);
  background: var(--card);
  padding: 10px 16px;
  border-radius: 8px;
}
.docs-btn:hover {
  border-color: var(--accent);
}
.main {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-top: 32px;
}
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px 32px;
}
.title-code {
  font-family: var(--mono);
  font-size: 0.9em;
}
.cmd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 20px;
  margin-top: 16px;
  min-width: 0;
}
.cmd code {
  font-family: var(--mono);
  font-size: 15px;
  word-break: break-all;
}
.cmd.alt {
  background: var(--soft);
  margin-top: 0;
}
.cmd.compact {
  margin-top: 0;
  padding: 10px 16px;
}
.cmd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.cmd-tag {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.cmd button {
  flex-shrink: 0;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
}
.cmd button:hover {
  color: var(--accent);
}
.step {
  margin-top: 20px;
}
.note {
  margin-top: 12px;
  background: var(--soft);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 20px;
  color: var(--muted);
  font-size: 14px;
}
.inline {
  font-family: var(--mono);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1px 6px;
  color: var(--text);
}
hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 28px 0;
}
.tip {
  color: var(--muted);
  font-size: 13px;
  margin: 12px 0 0;
}
.link {
  color: var(--accent);
  text-decoration: none;
}
.link:hover {
  text-decoration: underline;
}
.trouble {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
</style>
