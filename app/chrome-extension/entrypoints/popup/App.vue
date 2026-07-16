<template>
  <div class="popup-container">
    <div class="header">
      <div class="header-content">
        <div class="header-title-group">
          <h1 class="header-title">MCP Chrome Extension</h1>
          <span class="build-version">Build: 2026-04-04 23:10</span>
        </div>
      </div>
    </div>
    <div class="content">
      <div v-if="showRecorderUi" class="section">
        <h2 class="section-title">Recorder Sidebar</h2>
        <div class="config-card recorder-quick-card">
          <div class="status-info">
            <span
              :class="['status-dot', recorderState.isRecording ? 'bg-red-500' : 'bg-gray-500']"
            ></span>
            <span class="status-text">{{ recorderStatusText }}</span>
          </div>
          <div v-if="recorderState.url || activeTabUrl" class="status-timestamp recorder-url">
            {{ recorderState.url || activeTabUrl }}
          </div>
          <button
            class="record-button record-start"
            :disabled="isOpeningRecorderSidebar"
            @click="openRecorderSidebar"
          >
            <span>{{ isOpeningRecorderSidebar ? 'Opening…' : 'Open Recorder Sidebar' }}</span>
          </button>
          <p v-if="recorderSidebarError" class="recorder-error">
            {{ recorderSidebarError }}
          </p>
          <p v-if="recorderEnvText" class="option-description">
            {{ recorderEnvText }}
          </p>
          <p class="option-description">
            Recording opens in the Chrome side panel when available, otherwise in a dedicated
            recorder window.
          </p>
        </div>
      </div>

      <div v-if="showRecorderUi" class="section">
        <h2 class="section-title">Workflow Exports</h2>
        <div class="config-card workflow-export-card">
          <div class="recorded-tools-header">
            <div class="recorded-tool-meta">
              <p class="recorded-tool-name">{{ activeWorkflowHostname || 'Current site' }}</p>
              <p class="recorded-tool-details">
                Latest capture and saved workflows are scoped to the active hostname.
              </p>
            </div>
            <span class="workflow-count-badge">{{ savedRecordedTools.length }} saved</span>
          </div>

          <div class="workflow-export-block">
            <p class="recorded-tool-details">Latest capture</p>
            <div v-if="lastRecordedToolId" class="workflow-range-row">
              <label class="workflow-range-label" for="workflow-replay-range">Steps</label>
              <input
                id="workflow-replay-range"
                v-model="replayStepSelectionInput"
                type="text"
                class="workflow-range-input"
                placeholder="All steps or e.g. 1, 3-7, 9-"
                spellcheck="false"
              />
            </div>
            <p v-if="lastRecordedToolId" class="option-description workflow-range-hint">
              Leave empty to replay all steps. Supports single numbers, ranges, and open-ended
              ranges.
            </p>
            <div class="workflow-action-row">
              <button
                class="workflow-action-button"
                :disabled="!lastRecordedToolId || replayingToolId === lastRecordedToolId"
                @click="replayLatestWorkflow"
              >
                {{ replayingToolId === lastRecordedToolId ? 'Replaying…' : 'Replay' }}
              </button>
              <button
                class="workflow-action-button"
                :disabled="!lastRecordedWorkflowJson"
                @click="copyLatestWorkflowJson"
              >
                {{ workflowCopyButtonText }}
              </button>
              <button
                class="workflow-action-button"
                :disabled="!lastRecordedWebMcpJson"
                @click="copyLatestWebMcpJson"
              >
                {{ webmcpCopyButtonText }}
              </button>
              <button
                class="workflow-action-button"
                :disabled="!lastRecordedRawWorkflowJson"
                @click="copyLatestRawWorkflowJson"
              >
                {{ rawWorkflowCopyButtonText }}
              </button>
              <button
                class="workflow-action-button"
                :disabled="!lastRecordedWorkflowJson"
                @click="downloadLatestWorkflowJson"
              >
                Export Workflow
              </button>
              <button
                class="workflow-action-button"
                :disabled="!lastRecordedWebMcpJson"
                @click="downloadLatestWebMcpJson"
              >
                Export WebMCP
              </button>
              <button
                class="workflow-action-button"
                :disabled="!lastRecordedRawWorkflowJson"
                @click="downloadLatestRawWorkflowJson"
              >
                Export Raw
              </button>
              <button
                class="workflow-action-button"
                :disabled="!lastRecordedToolId || refiningToolId === lastRecordedToolId"
                @click="refineLatestWorkflow"
              >
                {{ refiningToolId === lastRecordedToolId ? 'Refining…' : 'Refine Inputs' }}
              </button>
            </div>
            <div v-if="lastRecordedToolId" class="workflow-editor-block">
              <div class="workflow-action-row">
                <button
                  class="workflow-action-button"
                  :disabled="isSavingWorkflowEditor || !workflowEditorJson.trim()"
                  @click="saveWorkflowEditor"
                >
                  {{ isSavingWorkflowEditor ? 'Saving…' : 'Save Workflow' }}
                </button>
                <button
                  class="workflow-action-button"
                  :disabled="isSavingWorkflowEditor || !lastRecordedWorkflowJson"
                  @click="resetWorkflowEditor"
                >
                  Reset
                </button>
              </div>
              <textarea
                v-model="workflowEditorJson"
                class="recorder-textarea workflow-editor"
                spellcheck="false"
              />
              <p v-if="workflowEditorStatus" class="option-description workflow-empty-text">
                {{ workflowEditorStatus }}
              </p>
            </div>
            <div v-if="lastRecordedToolId" class="workflow-editor-block">
              <p class="recorded-tool-details">Replay Params</p>
              <div v-if="activeWorkflowInputSchema.length" class="workflow-params-form">
                <label
                  v-for="field in activeWorkflowInputSchema"
                  :key="field.name"
                  class="workflow-param-field"
                >
                  <span class="workflow-param-label">
                    {{ field.name }}
                    <span class="workflow-param-meta">{{
                      field.required ? 'Required' : 'Optional'
                    }}</span>
                  </span>
                  <span v-if="field.description" class="workflow-param-description">
                    {{ field.description }}
                  </span>
                  <label v-if="field.type === 'boolean'" class="workflow-param-checkbox">
                    <input v-model="replayFormValues[field.name]" type="checkbox" />
                    <span>{{ replayFormValues[field.name] ? 'true' : 'false' }}</span>
                  </label>
                  <textarea
                    v-else-if="isReplayTextareaField(field)"
                    v-model="replayFormValues[field.name]"
                    class="recorder-textarea workflow-param-textarea"
                    spellcheck="false"
                  />
                  <input
                    v-else
                    v-model="replayFormValues[field.name]"
                    type="text"
                    class="workflow-param-input"
                    spellcheck="false"
                  />
                </label>
              </div>
              <p v-else class="option-description workflow-empty-text">
                This workflow has no parameterized inputs.
              </p>
              <p v-if="workflowReplayStatus" class="option-description workflow-empty-text">
                {{ workflowReplayStatus }}
              </p>
            </div>
            <pre v-if="lastRecordedWorkflowJson" class="mcp-config-json recorder-json">{{
              lastRecordedWorkflowJson
            }}</pre>
            <p v-else class="option-description workflow-empty-text">
              Stop a recording in the recorder sidebar to populate the latest workflow JSON here.
            </p>
          </div>

          <div class="workflow-saved-block">
            <p class="recorded-tool-details">Saved workflows</p>
            <div v-if="savedRecordedTools.length" class="recorded-tools-list">
              <article
                v-for="tool in savedRecordedTools"
                :key="tool.id"
                :class="[
                  'recorded-tool-item',
                  { 'recorded-tool-item-active': tool.id === lastRecordedToolId },
                ]"
                @click="loadSavedWorkflow(tool)"
              >
                <div class="recorded-tool-meta">
                  <div class="recorded-tool-title-row">
                    <h3 class="recorded-tool-name">{{ tool.name }}</h3>
                    <span v-if="tool.id === lastRecordedToolId" class="workflow-count-badge"
                      >Loaded</span
                    >
                  </div>
                  <p class="recorded-tool-description">{{ tool.description }}</p>
                  <p class="recorded-tool-details">
                    {{ tool.actionCount }} actions · {{ new Date(tool.updatedAt).toLocaleString() }}
                  </p>
                </div>
                <div class="recorded-tool-actions">
                  <button class="workflow-action-button" @click.stop="loadSavedWorkflow(tool)">
                    {{ tool.id === lastRecordedToolId ? 'Loaded' : 'Load' }}
                  </button>
                  <button
                    class="workflow-action-button"
                    :disabled="replayingToolId === tool.id"
                    @click.stop="replaySavedWorkflow(tool.id)"
                  >
                    {{ replayingToolId === tool.id ? 'Replaying…' : 'Replay' }}
                  </button>
                  <button class="workflow-action-button" @click.stop="copySavedWorkflow(tool)">
                    Copy Workflow
                  </button>
                  <button class="workflow-action-button" @click.stop="copySavedWebMcp(tool)">
                    Copy WebMCP
                  </button>
                  <button class="workflow-action-button" @click.stop="copySavedRawWorkflow(tool)">
                    Copy Raw
                  </button>
                  <button
                    class="workflow-action-button"
                    :disabled="refiningToolId === tool.id"
                    @click.stop="refineSavedWorkflow(tool.id)"
                  >
                    {{ refiningToolId === tool.id ? 'Refining…' : 'Refine Inputs' }}
                  </button>
                  <button
                    class="workflow-action-button delete-tool-button"
                    @click.stop="deleteRecordedTool(tool.id)"
                  >
                    Delete
                  </button>
                </div>
              </article>
            </div>
            <p v-else class="option-description workflow-empty-text">
              No saved workflows for this site yet.
            </p>
          </div>
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">{{ getMessage('nativeServerConfigLabel') }}</h2>
        <div class="config-card">
          <div class="status-section">
            <div class="status-header">
              <p class="status-label">{{ getMessage('runningStatusLabel') }}</p>
              <button
                class="refresh-status-button"
                @click="refreshServerStatus"
                :title="getMessage('refreshStatusButton')"
              >
                🔄
              </button>
            </div>
            <div class="status-info">
              <span :class="['status-dot', getStatusClass()]"></span>
              <span class="status-text">{{ getStatusText() }}</span>
            </div>
            <div v-if="serverStatus.lastUpdated" class="status-timestamp">
              {{ getMessage('lastUpdatedLabel') }}
              {{ new Date(serverStatus.lastUpdated).toLocaleTimeString() }}
            </div>
          </div>

          <!-- Native Host Version Warning -->
          <div v-if="nativeHostVersion?.isOutdated" class="version-warning">
            <div class="warning-icon">⚠️</div>
            <div class="warning-content">
              <p class="warning-title">Native Host Outdated</p>
              <p class="warning-message">
                Installed: v{{ nativeHostVersion.version }} | Required: v{{
                  nativeHostVersion.minRequired
                }}
              </p>
              <p class="warning-command">Run: <code>npm update -g mcp-chrome-bridger</code></p>
            </div>
          </div>

          <!-- Native Host Version Info (when connected and up to date) -->
          <div
            v-else-if="nativeHostVersion && nativeConnectionStatus === 'connected'"
            class="version-info"
          >
            <span class="version-label">Native Host:</span>
            <span class="version-value">v{{ nativeHostVersion.version }}</span>
          </div>

          <div v-if="showMcpConfig" class="mcp-config-section">
            <div class="mcp-config-header">
              <p class="mcp-config-label">{{ getMessage('mcpServerConfigLabel') }}</p>
              <button class="copy-config-button" @click="copyMcpConfig">
                {{ copyButtonText }}
              </button>
            </div>
            <div class="mcp-config-content">
              <pre class="mcp-config-json">{{ mcpConfigJson }}</pre>
            </div>
          </div>
          <div class="port-section">
            <label for="port" class="port-label">{{ getMessage('connectionPortLabel') }}</label>
            <input
              type="text"
              id="port"
              :value="nativeServerPort"
              @input="updatePort"
              class="port-input"
            />
          </div>

          <button class="connect-button" :disabled="isConnecting" @click="testNativeConnection">
            <BoltIcon />
            <span>{{
              isConnecting
                ? getMessage('connectingStatus')
                : nativeConnectionStatus === 'connected'
                  ? getMessage('disconnectButton')
                  : getMessage('connectButton')
            }}</span>
          </button>

          <div class="webmcp-option">
            <label class="checkbox-label">
              <input
                type="checkbox"
                v-model="worldbookWebMCPEnabled"
                @change="saveWorldbookWebMCPPreference"
              />
              <span class="checkbox-text">Worldbook WebMCP</span>
              <a
                href="https://worldbook.it.com/"
                target="_blank"
                class="help-icon"
                title="Worldbook is a community-driven registry of WebMCP site tools. When enabled, MCP Chrome Extension fetches tool configurations from the Worldbook API, giving you access to pre-configured tools for popular websites."
                >?</a
              >
            </label>
            <p class="option-description"
              >Fetch site tools config from Worldbook API when enabled</p
            >
          </div>

          <div class="webmcp-option">
            <label class="checkbox-label">
              <input type="checkbox" v-model="debugCoordinates" @change="toggleDebugCoordinates" />
              <span class="checkbox-text">Debug Coordinates</span>
              <span
                class="help-icon"
                title="When enabled, shows a floating display with mouse coordinates as you move the cursor. Useful for debugging click positions."
                >?</span
              >
            </label>
            <p class="option-description">Show mouse coordinates on page (for debugging)</p>
          </div>

          <div class="webmcp-option">
            <label class="checkbox-label">
              <input
                type="checkbox"
                v-model="showLastClickOnScreenshot"
                @change="saveShowLastClickPreference"
              />
              <span class="checkbox-text">Show Last Click on Screenshot</span>
              <span
                class="help-icon"
                title="When enabled, screenshots will show a red marker at the last click position. Useful for debugging coordinate conversions."
                >?</span
              >
            </label>
            <p class="option-description"
              >Mark last click position on screenshots (for debugging)</p
            >
          </div>
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">{{ getMessage('semanticEngineLabel') }}</h2>
        <div class="semantic-engine-card">
          <div class="semantic-engine-status">
            <div class="status-info">
              <span :class="['status-dot', getSemanticEngineStatusClass()]"></span>
              <span class="status-text">{{ getSemanticEngineStatusText() }}</span>
            </div>
            <div v-if="semanticEngineLastUpdated" class="status-timestamp">
              {{ getMessage('lastUpdatedLabel') }}
              {{ new Date(semanticEngineLastUpdated).toLocaleTimeString() }}
            </div>
          </div>

          <ProgressIndicator
            v-if="isSemanticEngineInitializing"
            :visible="isSemanticEngineInitializing"
            :text="semanticEngineInitProgress"
            :showSpinner="true"
          />

          <button
            class="semantic-engine-button"
            :disabled="isSemanticEngineInitializing"
            @click="initializeSemanticEngine"
          >
            <BoltIcon />
            <span>{{ getSemanticEngineButtonText() }}</span>
          </button>
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">{{ getMessage('embeddingModelLabel') }}</h2>

        <ProgressIndicator
          v-if="isModelSwitching || isModelDownloading"
          :visible="isModelSwitching || isModelDownloading"
          :text="getProgressText()"
          :showSpinner="true"
        />
        <div v-if="modelInitializationStatus === 'error'" class="error-card">
          <div class="error-content">
            <div class="error-icon">⚠️</div>
            <div class="error-details">
              <p class="error-title">{{ getMessage('semanticEngineInitFailedStatus') }}</p>
              <p class="error-message">{{
                modelErrorMessage || getMessage('semanticEngineInitFailedStatus')
              }}</p>
              <p class="error-suggestion">{{ getErrorTypeText() }}</p>
            </div>
          </div>
          <button
            class="retry-button"
            @click="retryModelInitialization"
            :disabled="isModelSwitching || isModelDownloading"
          >
            <span>🔄</span>
            <span>{{ getMessage('retryButton') }}</span>
          </button>
        </div>

        <div class="model-list">
          <div
            v-for="model in availableModels"
            :key="model.preset"
            :class="[
              'model-card',
              {
                selected: currentModel === model.preset,
                disabled: isModelSwitching || isModelDownloading,
              },
            ]"
            @click="
              !isModelSwitching && !isModelDownloading && switchModel(model.preset as ModelPreset)
            "
          >
            <div class="model-header">
              <div class="model-info">
                <p class="model-name" :class="{ 'selected-text': currentModel === model.preset }">
                  {{ model.preset }}
                </p>
                <p class="model-description">{{ getModelDescription(model) }}</p>
              </div>
              <div v-if="currentModel === model.preset" class="check-icon">
                <CheckIcon class="text-white" />
              </div>
            </div>
            <div class="model-tags">
              <span class="model-tag performance">{{ getPerformanceText(model.performance) }}</span>
              <span class="model-tag size">{{ model.size }}</span>
              <span class="model-tag dimension">{{ model.dimension }}D</span>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">{{ getMessage('indexDataManagementLabel') }}</h2>
        <div class="stats-grid">
          <div class="stats-card">
            <div class="stats-header">
              <p class="stats-label">{{ getMessage('indexedPagesLabel') }}</p>
              <span class="stats-icon violet">
                <DocumentIcon />
              </span>
            </div>
            <p class="stats-value">{{ storageStats?.indexedPages || 0 }}</p>
          </div>

          <div class="stats-card">
            <div class="stats-header">
              <p class="stats-label">{{ getMessage('indexSizeLabel') }}</p>
              <span class="stats-icon teal">
                <DatabaseIcon />
              </span>
            </div>
            <p class="stats-value">{{ formatIndexSize() }}</p>
          </div>

          <div class="stats-card">
            <div class="stats-header">
              <p class="stats-label">{{ getMessage('activeTabsLabel') }}</p>
              <span class="stats-icon blue">
                <TabIcon />
              </span>
            </div>
            <p class="stats-value">{{ getActiveTabsCount() }}</p>
          </div>

          <div class="stats-card">
            <div class="stats-header">
              <p class="stats-label">{{ getMessage('vectorDocumentsLabel') }}</p>
              <span class="stats-icon green">
                <VectorIcon />
              </span>
            </div>
            <p class="stats-value">{{ storageStats?.totalDocuments || 0 }}</p>
          </div>
        </div>
        <ProgressIndicator
          v-if="isClearingData && clearDataProgress"
          :visible="isClearingData"
          :text="clearDataProgress"
          :showSpinner="true"
        />

        <button
          class="danger-button"
          :disabled="isClearingData"
          @click="showClearConfirmation = true"
        >
          <TrashIcon />
          <span>{{
            isClearingData ? getMessage('clearingStatus') : getMessage('clearAllDataButton')
          }}</span>
        </button>
      </div>

      <!-- Model Cache Management Section -->
      <ModelCacheManagement
        :cache-stats="cacheStats"
        :is-managing-cache="isManagingCache"
        @cleanup-cache="cleanupCache"
        @clear-all-cache="clearAllCache"
      />
    </div>

    <div class="footer">
      <p class="footer-text">chrome mcp server for ai</p>
    </div>

    <ConfirmDialog
      :visible="showClearConfirmation"
      :title="getMessage('confirmClearDataTitle')"
      :message="getMessage('clearDataWarningMessage')"
      :items="[
        getMessage('clearDataList1'),
        getMessage('clearDataList2'),
        getMessage('clearDataList3'),
      ]"
      :warning="getMessage('clearDataIrreversibleWarning')"
      icon="⚠️"
      :confirm-text="getMessage('confirmClearButton')"
      :cancel-text="getMessage('cancelButton')"
      :confirming-text="getMessage('clearingStatus')"
      :is-confirming="isClearingData"
      @confirm="confirmClearAllData"
      @cancel="hideClearDataConfirmation"
    />
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import {
  PREDEFINED_MODELS,
  type ModelPreset,
  getModelInfo,
  getCacheStats,
  clearModelCache,
  cleanupModelCache,
} from '@/utils/semantic-similarity-engine';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import { getMessage } from '@/utils/i18n';

import ConfirmDialog from './components/ConfirmDialog.vue';
import ProgressIndicator from './components/ProgressIndicator.vue';
import ModelCacheManagement from './components/ModelCacheManagement.vue';
import {
  DocumentIcon,
  DatabaseIcon,
  BoltIcon,
  TrashIcon,
  CheckIcon,
  TabIcon,
  VectorIcon,
} from './components/icons';

const nativeConnectionStatus = ref<'unknown' | 'connected' | 'disconnected'>('unknown');
const isConnecting = ref(false);
const nativeServerPort = ref<number>(12306);
const worldbookWebMCPEnabled = ref<boolean>(true); // Worldbook WebMCP enabled by default
const debugCoordinates = ref<boolean>(false); // Debug coordinates display, off by default
const showLastClickOnScreenshot = ref<boolean>(false); // Show last click position on screenshot, off by default
const showRecorderUi = false;
const activeTabId = ref<number | null>(null);
const activeTabUrl = ref<string>('');
const recorderToolName = ref('');
const recorderDescription = ref('');
const recorderEnvText = ref('');
const isStartingRecorder = ref(false);
const isStoppingRecorder = ref(false);
const isOpeningRecorderSidebar = ref(false);
const recorderSidebarError = ref('');
const rawWorkflowCopyButtonText = ref('Copy Raw');
const workflowCopyButtonText = ref('Copy Workflow');
const webmcpCopyButtonText = ref('Copy WebMCP');
const lastRecordedToolId = ref('');
const refiningToolId = ref('');
const replayingToolId = ref('');
const activeWorkflowDoc = ref<Record<string, any> | null>(null);
const workflowEditorJson = ref('');
const workflowEditorStatus = ref('');
const isSavingWorkflowEditor = ref(false);
const replayStepSelectionInput = ref('');
const replayFormValues = ref<Record<string, string | boolean>>({});
const workflowReplayStatus = ref('');
const lastRecordedRawWorkflowJson = ref('');
const lastRecordedWorkflowJson = ref('');
const lastRecordedWebMcpJson = ref('');
const recorderState = ref<{
  isRecording: boolean;
  tabId: number | null;
  toolName: string;
  description: string;
  url: string | null;
  actionCount: number;
  startedAt: number | null;
}>({
  isRecording: false,
  tabId: null,
  toolName: '',
  description: '',
  url: null,
  actionCount: 0,
  startedAt: null,
});
const savedRecordedTools = ref<
  Array<{
    id: string;
    name: string;
    description: string;
    hostname: string;
    siteName: string;
    startUrl: string;
    updatedAt: number;
    actionCount: number;
    rawWorkflow?: Record<string, any>;
    workflow: Record<string, any>;
    tool: Record<string, any>;
  }>
>([]);

const serverStatus = ref<{
  isRunning: boolean;
  port?: number;
  lastUpdated: number;
}>({
  isRunning: false,
  lastUpdated: Date.now(),
});

// Native host version info
const nativeHostVersion = ref<{
  version: string;
  isOutdated: boolean;
  minRequired: string;
} | null>(null);

const showMcpConfig = computed(() => {
  return nativeConnectionStatus.value === 'connected' && serverStatus.value.isRunning;
});

const copyButtonText = ref(getMessage('copyConfigButton'));

const mcpConfigJson = computed(() => {
  const port = serverStatus.value.port || nativeServerPort.value;
  const config = {
    mcpServers: {
      'mcp-chrome': {
        type: 'http',
        url: `http://127.0.0.1:${port}/mcp`,
      },
    },
  };
  return JSON.stringify(config, null, 2);
});

const currentModel = ref<ModelPreset | null>(null);
const isModelSwitching = ref(false);
const modelSwitchProgress = ref('');

const modelDownloadProgress = ref<number>(0);
const isModelDownloading = ref(false);
const modelInitializationStatus = ref<'idle' | 'downloading' | 'initializing' | 'ready' | 'error'>(
  'idle',
);
const modelErrorMessage = ref<string>('');
const modelErrorType = ref<'network' | 'file' | 'unknown' | ''>('');

const selectedVersion = ref<'quantized'>('quantized');

const storageStats = ref<{
  indexedPages: number;
  totalDocuments: number;
  totalTabs: number;
  indexSize: number;
  isInitialized: boolean;
} | null>(null);
const isRefreshingStats = ref(false);
const isClearingData = ref(false);
const showClearConfirmation = ref(false);
const clearDataProgress = ref('');

const semanticEngineStatus = ref<'idle' | 'initializing' | 'ready' | 'error'>('idle');
const isSemanticEngineInitializing = ref(false);
const semanticEngineInitProgress = ref('');
const semanticEngineLastUpdated = ref<number | null>(null);

// Cache management
const isManagingCache = ref(false);
const cacheStats = ref<{
  totalSize: number;
  totalSizeMB: number;
  entryCount: number;
  entries: Array<{
    url: string;
    size: number;
    sizeMB: number;
    timestamp: number;
    age: string;
    expired: boolean;
  }>;
} | null>(null);

const availableModels = computed(() => {
  return Object.entries(PREDEFINED_MODELS).map(([key, value]) => ({
    preset: key as ModelPreset,
    ...value,
  }));
});

const isRecordableActiveTab = computed(() => /^https?:\/\//.test(activeTabUrl.value));

const recorderStatusText = computed(() => {
  if (recorderState.value.isRecording) {
    return `Recording ${recorderState.value.actionCount} actions`;
  }
  if (isRecordableActiveTab.value && activeTabUrl.value) {
    return 'Ready to record on active tab';
  }
  return 'Open an http(s) page to start recording';
});

const activeWorkflowHostname = computed(() => {
  const candidate = recorderState.value.url || activeTabUrl.value;
  if (!candidate) return '';
  try {
    return new URL(candidate).hostname;
  } catch {
    return '';
  }
});

const activeWorkflowInputSchema = computed<
  Array<{
    name: string;
    type: 'string' | 'boolean';
    required: boolean;
    description?: string;
    default?: string | boolean;
  }>
>(() => {
  const schema = activeWorkflowDoc.value?.input_schema;
  return Array.isArray(schema) ? schema : [];
});

const setWorkflowEditorStatus = (message: string) => {
  workflowEditorStatus.value = message;
  setTimeout(() => {
    if (workflowEditorStatus.value === message) {
      workflowEditorStatus.value = '';
    }
  }, 2000);
};

const setWorkflowReplayStatus = (message: string) => {
  workflowReplayStatus.value = message;
  setTimeout(() => {
    if (workflowReplayStatus.value === message) {
      workflowReplayStatus.value = '';
    }
  }, 2500);
};

const buildDefaultReplayFormValues = (workflow: Record<string, any>) => {
  const params: Record<string, string | boolean> = {};
  const schema = Array.isArray(workflow?.input_schema) ? workflow.input_schema : [];
  schema.forEach((field: any) => {
    if (!field?.name) return;
    if (field.type === 'boolean') {
      params[field.name] = typeof field.default === 'boolean' ? field.default : false;
      return;
    }
    params[field.name] =
      typeof field.default === 'string'
        ? field.default
        : field.default != null
          ? String(field.default)
          : '';
  });
  return params;
};

const buildReplayParamsForSubmit = (
  workflow: Record<string, any>,
  values: Record<string, string | boolean>,
) => {
  const params: Record<string, string | boolean> = {};
  const schema = Array.isArray(workflow?.input_schema) ? workflow.input_schema : [];
  schema.forEach((field: any) => {
    if (!field?.name) return;
    if (field.type === 'boolean') {
      params[field.name] = Boolean(values[field.name]);
      return;
    }
    params[field.name] =
      typeof values[field.name] === 'string'
        ? values[field.name]
        : String(values[field.name] ?? '');
  });
  return params;
};

const getStatusClass = () => {
  if (nativeConnectionStatus.value === 'connected') {
    if (serverStatus.value.isRunning) {
      return 'bg-emerald-500';
    } else {
      return 'bg-yellow-500';
    }
  } else if (nativeConnectionStatus.value === 'disconnected') {
    return 'bg-red-500';
  } else {
    return 'bg-gray-500';
  }
};

const getStatusText = () => {
  if (nativeConnectionStatus.value === 'connected') {
    if (serverStatus.value.isRunning) {
      return getMessage('serviceRunningStatus', [
        (serverStatus.value.port || 'Unknown').toString(),
      ]);
    } else {
      return getMessage('connectedServiceNotStartedStatus');
    }
  } else if (nativeConnectionStatus.value === 'disconnected') {
    return getMessage('serviceNotConnectedStatus');
  } else {
    return getMessage('detectingStatus');
  }
};

const formatIndexSize = () => {
  if (!storageStats.value?.indexSize) return '0 MB';
  const sizeInMB = Math.round(storageStats.value.indexSize / (1024 * 1024));
  return `${sizeInMB} MB`;
};

const getModelDescription = (model: any) => {
  switch (model.preset) {
    case 'multilingual-e5-small':
      return getMessage('lightweightModelDescription');
    case 'multilingual-e5-base':
      return getMessage('betterThanSmallDescription');
    default:
      return getMessage('multilingualModelDescription');
  }
};

const getPerformanceText = (performance: string) => {
  switch (performance) {
    case 'fast':
      return getMessage('fastPerformance');
    case 'balanced':
      return getMessage('balancedPerformance');
    case 'accurate':
      return getMessage('accuratePerformance');
    default:
      return performance;
  }
};

const getSemanticEngineStatusText = () => {
  switch (semanticEngineStatus.value) {
    case 'ready':
      return getMessage('semanticEngineReadyStatus');
    case 'initializing':
      return getMessage('semanticEngineInitializingStatus');
    case 'error':
      return getMessage('semanticEngineInitFailedStatus');
    case 'idle':
    default:
      return getMessage('semanticEngineNotInitStatus');
  }
};

const getSemanticEngineStatusClass = () => {
  switch (semanticEngineStatus.value) {
    case 'ready':
      return 'bg-emerald-500';
    case 'initializing':
      return 'bg-yellow-500';
    case 'error':
      return 'bg-red-500';
    case 'idle':
    default:
      return 'bg-gray-500';
  }
};

const getActiveTabsCount = () => {
  return storageStats.value?.totalTabs || 0;
};

const getProgressText = () => {
  if (isModelDownloading.value) {
    return getMessage('downloadingModelStatus', [modelDownloadProgress.value.toString()]);
  } else if (isModelSwitching.value) {
    return modelSwitchProgress.value || getMessage('switchingModelStatus');
  }
  return '';
};

const getErrorTypeText = () => {
  switch (modelErrorType.value) {
    case 'network':
      return getMessage('networkErrorMessage');
    case 'file':
      return getMessage('modelCorruptedErrorMessage');
    case 'unknown':
    default:
      return getMessage('unknownErrorMessage');
  }
};

const getSemanticEngineButtonText = () => {
  switch (semanticEngineStatus.value) {
    case 'ready':
      return getMessage('reinitializeButton');
    case 'initializing':
      return getMessage('initializingStatus');
    case 'error':
      return getMessage('reinitializeButton');
    case 'idle':
    default:
      return getMessage('initSemanticEngineButton');
  }
};

const loadCacheStats = async () => {
  try {
    cacheStats.value = await getCacheStats();
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    cacheStats.value = null;
  }
};

const buildDefaultRecordedToolName = (url: string) => {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const normalized = hostname
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    return `${normalized || 'site'}_workflow`;
  } catch {
    return 'recorded_workflow';
  }
};

const refreshActiveTabContext = async () => {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId.value = activeTab?.id ?? null;
    activeTabUrl.value = activeTab?.url && /^https?:\/\//.test(activeTab.url) ? activeTab.url : '';

    if (!recorderState.value.isRecording && activeTabUrl.value) {
      if (!recorderToolName.value) {
        recorderToolName.value = buildDefaultRecordedToolName(activeTabUrl.value);
      }
      if (!recorderDescription.value) {
        recorderDescription.value = `Recorded workflow for ${new URL(activeTabUrl.value).hostname}`;
      }
    }
  } catch (error) {
    console.error('Failed to load active tab context:', error);
    activeTabId.value = null;
    activeTabUrl.value = '';
  }
};

const loadRecorderState = async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.GET_WEBMCP_RECORDING_STATE,
    });
    if (response?.success && response.state) {
      recorderState.value = response.state;
      if (response.state.isRecording) {
        recorderToolName.value = response.state.toolName;
        recorderDescription.value = response.state.description;
      }
    }
  } catch (error) {
    console.error('Failed to load recorder state:', error);
  }
};

const loadSavedRecordedTools = async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.LIST_LOCAL_WEBMCP_TOOLS,
    });

    if (!response?.success || !Array.isArray(response.tools)) {
      savedRecordedTools.value = [];
      return;
    }

    if (!activeTabUrl.value) {
      savedRecordedTools.value = response.tools;
      return;
    }

    const hostname = new URL(activeTabUrl.value).hostname;
    savedRecordedTools.value = response.tools.filter((tool: { hostname: string }) => {
      return tool.hostname === hostname;
    });
  } catch (error) {
    console.error('Failed to load recorded tools:', error);
    savedRecordedTools.value = [];
  }
};

const loadRecorderEnvironment = async () => {
  try {
    const popupChromeSidePanel = Boolean(chrome.sidePanel);
    const popupBrowserSidePanel = Boolean(
      (globalThis as typeof globalThis & { browser?: { sidePanel?: unknown } }).browser?.sidePanel,
    );

    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.GET_WEBMCP_RECORDER_ENV,
    });

    if (!response?.success || !response.env) {
      recorderEnvText.value = '';
      return;
    }

    const env = response.env as {
      backgroundHasChromeSidePanel: boolean;
      backgroundHasBrowserSidePanel: boolean;
      canUseSidePanel: boolean;
    };

    recorderEnvText.value =
      `Popup chrome.sidePanel=${popupChromeSidePanel}, popup browser.sidePanel=${popupBrowserSidePanel}, ` +
      `background chrome.sidePanel=${env.backgroundHasChromeSidePanel}, ` +
      `background browser.sidePanel=${env.backgroundHasBrowserSidePanel}, ` +
      `canUseSidePanel=${env.canUseSidePanel}`;
  } catch (error) {
    console.error('Failed to load recorder environment:', error);
    recorderEnvText.value = '';
  }
};

type PopupSidePanelApi = {
  open(options: { tabId?: number; windowId?: number }): Promise<void>;
  setOptions(options: { tabId?: number; path?: string; enabled: boolean }): Promise<void>;
};

const getPopupSidePanelApi = (): PopupSidePanelApi | null => {
  const browserApi = (
    globalThis as typeof globalThis & {
      browser?: {
        sidePanel?: PopupSidePanelApi;
      };
    }
  ).browser;

  return chrome.sidePanel ?? browserApi?.sidePanel ?? null;
};

const refreshRecorderPanel = async () => {
  await refreshActiveTabContext();
  await loadRecorderState();
  await loadSavedRecordedTools();
  await loadRecorderEnvironment();
};

const openRecorderSidebar = async () => {
  if (isOpeningRecorderSidebar.value) return;

  isOpeningRecorderSidebar.value = true;
  recorderSidebarError.value = '';
  try {
    const currentWindow = await chrome.windows.getCurrent();
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const sidePanelApi = getPopupSidePanelApi();

    if (typeof currentWindow.id !== 'number') {
      throw new Error('Failed to determine current browser window.');
    }

    if (sidePanelApi && typeof activeTab?.id === 'number') {
      await sidePanelApi.open({ tabId: activeTab.id });
      await sidePanelApi.setOptions({
        tabId: activeTab.id,
        path: 'sidepanel.html',
        enabled: true,
      });
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.OPEN_WEBMCP_RECORDER_SIDEPANEL,
      tabId: activeTab?.id,
      windowId: currentWindow.id,
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Chrome refused to open the recorder side panel.');
    }
  } catch (error: any) {
    recorderSidebarError.value =
      error?.message || 'Chrome refused to open the recorder side panel.';
    console.error('Failed to open recorder side panel:', error);
  } finally {
    isOpeningRecorderSidebar.value = false;
  }
};

const startWorkflowRecording = async () => {
  if (isStartingRecorder.value || recorderState.value.isRecording) return;

  isStartingRecorder.value = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.START_WEBMCP_RECORDING,
      toolName: recorderToolName.value,
      description: recorderDescription.value,
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Failed to start recording');
    }

    lastRecordedRawWorkflowJson.value = '';
    lastRecordedWorkflowJson.value = '';
    lastRecordedWebMcpJson.value = '';
    lastRecordedToolId.value = '';
    workflowEditorJson.value = '';
    workflowEditorStatus.value = '';
    activeWorkflowDoc.value = null;
    replayStepSelectionInput.value = '';
    replayFormValues.value = {};
    workflowReplayStatus.value = '';
    await refreshRecorderPanel();
  } catch (error) {
    console.error('Failed to start workflow recording:', error);
  } finally {
    isStartingRecorder.value = false;
  }
};

const stopWorkflowRecording = async () => {
  if (isStoppingRecorder.value || !recorderState.value.isRecording) return;

  isStoppingRecorder.value = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.STOP_WEBMCP_RECORDING,
    });

    if (!response?.success || !response.savedTool) {
      throw new Error(response?.error || 'Failed to stop recording');
    }

    applyToolToWorkspace(response.savedTool);

    if (typeof response.tabId === 'number') {
      await chrome.runtime.sendMessage({
        type: 'webmcp:detect-tools',
        tabId: response.tabId,
      });
    }

    await refreshRecorderPanel();
  } catch (error) {
    console.error('Failed to stop workflow recording:', error);
  } finally {
    isStoppingRecorder.value = false;
  }
};

const setCopyButtonFeedback = (
  buttonRef: typeof rawWorkflowCopyButtonText,
  copiedLabel: string,
  defaultLabel: string,
) => {
  buttonRef.value = copiedLabel;
  setTimeout(() => {
    buttonRef.value = defaultLabel;
  }, 1500);
};

const copyLatestRawWorkflowJson = async () => {
  if (!lastRecordedRawWorkflowJson.value) return;
  try {
    await navigator.clipboard.writeText(lastRecordedRawWorkflowJson.value);
    setCopyButtonFeedback(rawWorkflowCopyButtonText, 'Copied', 'Copy Raw');
  } catch (error) {
    console.error('Failed to copy raw workflow JSON:', error);
  }
};

const copyLatestWorkflowJson = async () => {
  if (!lastRecordedWorkflowJson.value) return;
  try {
    await navigator.clipboard.writeText(lastRecordedWorkflowJson.value);
    setCopyButtonFeedback(workflowCopyButtonText, 'Copied', 'Copy Workflow');
  } catch (error) {
    console.error('Failed to copy workflow JSON:', error);
  }
};

const copyLatestWebMcpJson = async () => {
  if (!lastRecordedWebMcpJson.value) return;
  try {
    await navigator.clipboard.writeText(lastRecordedWebMcpJson.value);
    setCopyButtonFeedback(webmcpCopyButtonText, 'Copied', 'Copy WebMCP');
  } catch (error) {
    console.error('Failed to copy WebMCP JSON:', error);
  }
};

const downloadJson = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const downloadLatestRawWorkflowJson = async () => {
  if (!lastRecordedRawWorkflowJson.value) return;
  downloadJson(
    `${recorderToolName.value || 'recorded_workflow'}.raw.workflow.json`,
    lastRecordedRawWorkflowJson.value,
  );
};

const downloadLatestWorkflowJson = async () => {
  if (!lastRecordedWorkflowJson.value) return;
  downloadJson(
    `${recorderToolName.value || 'recorded_workflow'}.workflow.json`,
    lastRecordedWorkflowJson.value,
  );
};

const downloadLatestWebMcpJson = async () => {
  if (!lastRecordedWebMcpJson.value) return;
  downloadJson(
    `${recorderToolName.value || 'recorded_workflow'}.webmcp.json`,
    lastRecordedWebMcpJson.value,
  );
};

const applyToolToWorkspace = (tool: {
  id: string;
  name: string;
  description: string;
  rawWorkflow?: Record<string, any>;
  workflow: Record<string, any>;
  tool: Record<string, any>;
}) => {
  lastRecordedToolId.value = tool.id;
  recorderToolName.value = tool.name;
  recorderDescription.value = tool.description;
  lastRecordedRawWorkflowJson.value = JSON.stringify(tool.rawWorkflow || tool.workflow, null, 2);
  lastRecordedWorkflowJson.value = JSON.stringify(tool.workflow, null, 2);
  lastRecordedWebMcpJson.value = JSON.stringify(tool.tool, null, 2);
  activeWorkflowDoc.value = tool.workflow;
  workflowEditorJson.value = JSON.stringify(tool.workflow, null, 2);
  replayFormValues.value = buildDefaultReplayFormValues(tool.workflow);
};

const isReplayTextareaField = (field: { name: string; description?: string }) => {
  const hint = `${field.name} ${field.description || ''}`.toLowerCase();
  return /body|content|description|summary|message|正文|内容|描述|摘要/.test(hint);
};

const refineSavedWorkflow = async (id: string) => {
  if (refiningToolId.value) return;

  refiningToolId.value = id;
  try {
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.REFINE_WEBMCP_WORKFLOW_PARAMETERS,
      id,
    });
    if (!response?.success || !response.tool) {
      throw new Error(response?.error || 'Failed to refine workflow inputs');
    }

    applyToolToWorkspace(response.tool);
    await loadSavedRecordedTools();
  } catch (error) {
    console.error('Failed to refine workflow inputs:', error);
  } finally {
    refiningToolId.value = '';
  }
};

const refineLatestWorkflow = async () => {
  if (!lastRecordedToolId.value) return;
  await refineSavedWorkflow(lastRecordedToolId.value);
};

const loadSavedWorkflow = (tool: {
  id: string;
  name: string;
  description: string;
  rawWorkflow?: Record<string, any>;
  workflow: Record<string, any>;
  tool: Record<string, any>;
}) => {
  applyToolToWorkspace(tool);
  setWorkflowEditorStatus('Loaded workflow into editor');
};

const resetWorkflowEditor = () => {
  if (!lastRecordedWorkflowJson.value) return;
  workflowEditorJson.value = lastRecordedWorkflowJson.value;
  workflowEditorStatus.value = '';
};

const saveWorkflowEditor = async () => {
  if (!lastRecordedToolId.value || isSavingWorkflowEditor.value) return;

  isSavingWorkflowEditor.value = true;
  try {
    const parsedWorkflow = JSON.parse(workflowEditorJson.value);
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.UPDATE_LOCAL_WEBMCP_TOOL_WORKFLOW,
      id: lastRecordedToolId.value,
      workflow: parsedWorkflow,
    });

    if (!response?.success || !response.tool) {
      throw new Error(response?.error || 'Failed to save workflow');
    }

    applyToolToWorkspace(response.tool);
    await loadSavedRecordedTools();
    if (activeTabId.value !== null) {
      await chrome.runtime.sendMessage({
        type: 'webmcp:detect-tools',
        tabId: activeTabId.value,
      });
    }
    setWorkflowEditorStatus('Workflow saved');
  } catch (error: any) {
    console.error('Failed to save workflow editor JSON:', error);
    setWorkflowEditorStatus(error?.message || 'Failed to save workflow');
  } finally {
    isSavingWorkflowEditor.value = false;
  }
};

const replaySavedWorkflow = async (id: string) => {
  if (replayingToolId.value) return;

  replayingToolId.value = id;
  try {
    const tool =
      savedRecordedTools.value.find((item) => item.id === id) ||
      (id === lastRecordedToolId.value && activeWorkflowDoc.value
        ? {
            id,
            workflow: activeWorkflowDoc.value,
          }
        : null);
    const parsedParams =
      id === lastRecordedToolId.value && activeWorkflowDoc.value
        ? buildReplayParamsForSubmit(activeWorkflowDoc.value, replayFormValues.value)
        : tool?.workflow
          ? buildReplayParamsForSubmit(tool.workflow, buildDefaultReplayFormValues(tool.workflow))
          : {};

    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.REPLAY_LOCAL_WEBMCP_WORKFLOW,
      id,
      params: parsedParams,
      stepSelection: replayStepSelectionInput.value.trim(),
    });
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to replay workflow');
    }

    if (typeof response.activeTabId === 'number') {
      activeTabId.value = response.activeTabId;
      await chrome.runtime.sendMessage({
        type: 'webmcp:detect-tools',
        tabId: response.activeTabId,
      });
    }

    setWorkflowReplayStatus(
      response.success
        ? `Replay finished: ${response.steps?.length || 0} steps${response.stepSelection ? ` (${response.stepSelection})` : ''}`
        : `Replay stopped: ${response.error || 'step failed'}`,
    );
  } catch (error: any) {
    console.error('Failed to replay workflow:', error);
    setWorkflowReplayStatus(error?.message || 'Failed to replay workflow');
  } finally {
    replayingToolId.value = '';
  }
};

const replayLatestWorkflow = async () => {
  if (!lastRecordedToolId.value) return;
  await replaySavedWorkflow(lastRecordedToolId.value);
};

const copySavedRawWorkflow = async (tool: {
  rawWorkflow?: Record<string, any>;
  workflow: Record<string, any>;
  tool: Record<string, any>;
}) => {
  try {
    await navigator.clipboard.writeText(
      JSON.stringify(tool.rawWorkflow || tool.workflow || tool.tool, null, 2),
    );
  } catch (error) {
    console.error('Failed to copy saved raw workflow JSON:', error);
  }
};

const copySavedWorkflow = async (tool: {
  workflow: Record<string, any>;
  tool: Record<string, any>;
}) => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(tool.workflow || tool.tool, null, 2));
  } catch (error) {
    console.error('Failed to copy saved workflow JSON:', error);
  }
};

const copySavedWebMcp = async (tool: { tool: Record<string, any> }) => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(tool.tool, null, 2));
  } catch (error) {
    console.error('Failed to copy saved WebMCP JSON:', error);
  }
};

const deleteRecordedTool = async (id: string) => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.DELETE_LOCAL_WEBMCP_TOOL,
      id,
    });
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to delete tool');
    }

    if (activeTabId.value !== null) {
      await chrome.runtime.sendMessage({
        type: 'webmcp:detect-tools',
        tabId: activeTabId.value,
      });
    }

    await loadSavedRecordedTools();
  } catch (error) {
    console.error('Failed to delete recorded tool:', error);
  }
};

const cleanupCache = async () => {
  if (isManagingCache.value) return;

  isManagingCache.value = true;
  try {
    await cleanupModelCache();
    // Refresh cache stats
    await loadCacheStats();
  } catch (error) {
    console.error('Failed to cleanup cache:', error);
  } finally {
    isManagingCache.value = false;
  }
};

const clearAllCache = async () => {
  if (isManagingCache.value) return;

  isManagingCache.value = true;
  try {
    await clearModelCache();
    // Refresh cache stats
    await loadCacheStats();
  } catch (error) {
    console.error('Failed to clear cache:', error);
  } finally {
    isManagingCache.value = false;
  }
};

const saveSemanticEngineState = async () => {
  try {
    const semanticEngineState = {
      status: semanticEngineStatus.value,
      lastUpdated: semanticEngineLastUpdated.value,
    };
    // eslint-disable-next-line no-undef
    await chrome.storage.local.set({ semanticEngineState });
  } catch (error) {
    console.error('保存语义引擎状态失败:', error);
  }
};

const initializeSemanticEngine = async () => {
  if (isSemanticEngineInitializing.value) return;

  const isReinitialization = semanticEngineStatus.value === 'ready';
  console.log(
    `🚀 User triggered semantic engine ${isReinitialization ? 'reinitialization' : 'initialization'}`,
  );

  isSemanticEngineInitializing.value = true;
  semanticEngineStatus.value = 'initializing';
  semanticEngineInitProgress.value = isReinitialization
    ? getMessage('semanticEngineInitializingStatus')
    : getMessage('semanticEngineInitializingStatus');
  semanticEngineLastUpdated.value = Date.now();

  await saveSemanticEngineState();

  try {
    // eslint-disable-next-line no-undef
    chrome.runtime
      .sendMessage({
        type: BACKGROUND_MESSAGE_TYPES.INITIALIZE_SEMANTIC_ENGINE,
      })
      .catch((error) => {
        console.error('❌ Error sending semantic engine initialization request:', error);
      });

    startSemanticEngineStatusPolling();

    semanticEngineInitProgress.value = isReinitialization
      ? getMessage('processingStatus')
      : getMessage('processingStatus');
  } catch (error: any) {
    console.error('❌ Failed to send initialization request:', error);
    semanticEngineStatus.value = 'error';
    semanticEngineInitProgress.value = `Failed to send initialization request: ${error?.message || 'Unknown error'}`;

    await saveSemanticEngineState();

    setTimeout(() => {
      semanticEngineInitProgress.value = '';
    }, 5000);

    isSemanticEngineInitializing.value = false;
    semanticEngineLastUpdated.value = Date.now();
    await saveSemanticEngineState();
  }
};

const checkSemanticEngineStatus = async () => {
  try {
    // eslint-disable-next-line no-undef
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.GET_MODEL_STATUS,
    });

    if (response && response.success && response.status) {
      const status = response.status;

      if (status.initializationStatus === 'ready') {
        semanticEngineStatus.value = 'ready';
        semanticEngineLastUpdated.value = Date.now();
        isSemanticEngineInitializing.value = false;
        semanticEngineInitProgress.value = getMessage('semanticEngineReadyStatus');
        await saveSemanticEngineState();
        stopSemanticEngineStatusPolling();
        setTimeout(() => {
          semanticEngineInitProgress.value = '';
        }, 2000);
      } else if (
        status.initializationStatus === 'downloading' ||
        status.initializationStatus === 'initializing'
      ) {
        semanticEngineStatus.value = 'initializing';
        isSemanticEngineInitializing.value = true;
        semanticEngineInitProgress.value = getMessage('semanticEngineInitializingStatus');
        semanticEngineLastUpdated.value = Date.now();
        await saveSemanticEngineState();
      } else if (status.initializationStatus === 'error') {
        semanticEngineStatus.value = 'error';
        semanticEngineLastUpdated.value = Date.now();
        isSemanticEngineInitializing.value = false;
        semanticEngineInitProgress.value = getMessage('semanticEngineInitFailedStatus');
        await saveSemanticEngineState();
        stopSemanticEngineStatusPolling();
        setTimeout(() => {
          semanticEngineInitProgress.value = '';
        }, 5000);
      } else {
        semanticEngineStatus.value = 'idle';
        isSemanticEngineInitializing.value = false;
        await saveSemanticEngineState();
      }
    } else {
      semanticEngineStatus.value = 'idle';
      isSemanticEngineInitializing.value = false;
      await saveSemanticEngineState();
    }
  } catch (error) {
    console.error('Popup: Failed to check semantic engine status:', error);
    semanticEngineStatus.value = 'idle';
    isSemanticEngineInitializing.value = false;
    await saveSemanticEngineState();
  }
};

const retryModelInitialization = async () => {
  if (!currentModel.value) return;

  console.log('🔄 Retrying model initialization...');

  modelErrorMessage.value = '';
  modelErrorType.value = '';
  modelInitializationStatus.value = 'downloading';
  modelDownloadProgress.value = 0;
  isModelDownloading.value = true;
  await switchModel(currentModel.value);
};

const updatePort = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const newPort = Number(target.value);
  nativeServerPort.value = newPort;

  await savePortPreference(newPort);
};

const checkNativeConnection = async () => {
  try {
    // eslint-disable-next-line no-undef
    const response = await chrome.runtime.sendMessage({ type: 'ping_native' });
    nativeConnectionStatus.value = response?.connected ? 'connected' : 'disconnected';
  } catch (error) {
    console.error('检测 Native 连接状态失败:', error);
    nativeConnectionStatus.value = 'disconnected';
  }
};

const checkServerStatus = async () => {
  try {
    // eslint-disable-next-line no-undef
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.GET_SERVER_STATUS,
    });
    if (response?.success && response.serverStatus) {
      serverStatus.value = response.serverStatus;
    }

    if (response?.connected !== undefined) {
      nativeConnectionStatus.value = response.connected ? 'connected' : 'disconnected';
    }
  } catch (error) {
    console.error('检测服务器状态失败:', error);
  }
};

const refreshServerStatus = async () => {
  try {
    // eslint-disable-next-line no-undef
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.REFRESH_SERVER_STATUS,
    });
    if (response?.success && response.serverStatus) {
      serverStatus.value = response.serverStatus;
    }

    if (response?.connected !== undefined) {
      nativeConnectionStatus.value = response.connected ? 'connected' : 'disconnected';
    }
  } catch (error) {
    console.error('刷新服务器状态失败:', error);
  }
};

const checkNativeHostVersion = async () => {
  try {
    // eslint-disable-next-line no-undef
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.GET_NATIVE_HOST_VERSION,
    });
    if (response?.success && response.versionInfo) {
      nativeHostVersion.value = {
        version: response.versionInfo.version,
        isOutdated: response.versionInfo.isOutdated,
        minRequired: response.minRequired,
      };
    }
  } catch (error) {
    console.error('获取 Native Host 版本失败:', error);
  }
};

const copyMcpConfig = async () => {
  try {
    await navigator.clipboard.writeText(mcpConfigJson.value);
    copyButtonText.value = '✅' + getMessage('configCopiedNotification');

    setTimeout(() => {
      copyButtonText.value = getMessage('copyConfigButton');
    }, 2000);
  } catch (error) {
    console.error('复制配置失败:', error);
    copyButtonText.value = '❌' + getMessage('networkErrorMessage');

    setTimeout(() => {
      copyButtonText.value = getMessage('copyConfigButton');
    }, 2000);
  }
};

const testNativeConnection = async () => {
  if (isConnecting.value) return;
  isConnecting.value = true;
  try {
    if (nativeConnectionStatus.value === 'connected') {
      // eslint-disable-next-line no-undef
      await chrome.runtime.sendMessage({ type: 'disconnect_native' });
      nativeConnectionStatus.value = 'disconnected';
    } else {
      console.log(`尝试连接到端口: ${nativeServerPort.value}`);
      // eslint-disable-next-line no-undef
      const response = await chrome.runtime.sendMessage({
        type: 'connectNative',
        port: nativeServerPort.value,
      });
      if (response && response.success) {
        nativeConnectionStatus.value = 'connected';
        console.log('连接成功:', response);
        await savePortPreference(nativeServerPort.value);
      } else {
        nativeConnectionStatus.value = 'disconnected';
        console.error('连接失败:', response);
      }
    }
  } catch (error) {
    console.error('测试连接失败:', error);
    nativeConnectionStatus.value = 'disconnected';
  } finally {
    isConnecting.value = false;
  }
};

const loadModelPreference = async () => {
  try {
    // eslint-disable-next-line no-undef
    const result = await chrome.storage.local.get([
      'selectedModel',
      'selectedVersion',
      'modelState',
      'semanticEngineState',
    ]);

    if (result.selectedModel) {
      const storedModel = result.selectedModel as string;
      console.log('📋 Stored model from storage:', storedModel);

      if (PREDEFINED_MODELS[storedModel as ModelPreset]) {
        currentModel.value = storedModel as ModelPreset;
        console.log(`✅ Loaded valid model: ${currentModel.value}`);
      } else {
        console.warn(
          `⚠️ Stored model "${storedModel}" not found in PREDEFINED_MODELS, using default`,
        );
        currentModel.value = 'multilingual-e5-small';
        await saveModelPreference(currentModel.value);
      }
    } else {
      console.log('⚠️ No model found in storage, using default');
      currentModel.value = 'multilingual-e5-small';
      await saveModelPreference(currentModel.value);
    }

    selectedVersion.value = 'quantized';
    console.log('✅ Using quantized version (fixed)');

    await saveVersionPreference('quantized');

    if (result.modelState) {
      const modelState = result.modelState;

      if (modelState.status === 'ready') {
        modelInitializationStatus.value = 'ready';
        modelDownloadProgress.value = modelState.downloadProgress || 100;
        isModelDownloading.value = false;
      } else {
        modelInitializationStatus.value = 'idle';
        modelDownloadProgress.value = 0;
        isModelDownloading.value = false;

        await saveModelState();
      }
    } else {
      modelInitializationStatus.value = 'idle';
      modelDownloadProgress.value = 0;
      isModelDownloading.value = false;
    }

    if (result.semanticEngineState) {
      const semanticState = result.semanticEngineState;
      if (semanticState.status === 'ready') {
        semanticEngineStatus.value = 'ready';
        semanticEngineLastUpdated.value = semanticState.lastUpdated || Date.now();
      } else if (semanticState.status === 'error') {
        semanticEngineStatus.value = 'error';
        semanticEngineLastUpdated.value = semanticState.lastUpdated || Date.now();
      } else {
        semanticEngineStatus.value = 'idle';
      }
    } else {
      semanticEngineStatus.value = 'idle';
    }
  } catch (error) {
    console.error('❌ 加载模型偏好失败:', error);
  }
};

const saveModelPreference = async (model: ModelPreset) => {
  try {
    // eslint-disable-next-line no-undef
    await chrome.storage.local.set({ selectedModel: model });
  } catch (error) {
    console.error('保存模型偏好失败:', error);
  }
};

const saveVersionPreference = async (version: 'full' | 'quantized' | 'compressed') => {
  try {
    // eslint-disable-next-line no-undef
    await chrome.storage.local.set({ selectedVersion: version });
  } catch (error) {
    console.error('保存版本偏好失败:', error);
  }
};

const savePortPreference = async (port: number) => {
  try {
    // eslint-disable-next-line no-undef
    await chrome.storage.local.set({ nativeServerPort: port });
    console.log(`端口偏好已保存: ${port}`);
  } catch (error) {
    console.error('保存端口偏好失败:', error);
  }
};

const loadPortPreference = async () => {
  try {
    // eslint-disable-next-line no-undef
    const result = await chrome.storage.local.get(['nativeServerPort']);
    if (result.nativeServerPort) {
      nativeServerPort.value = result.nativeServerPort;
      console.log(`端口偏好已加载: ${result.nativeServerPort}`);
    }
  } catch (error) {
    console.error('加载端口偏好失败:', error);
  }
};

const saveWorldbookWebMCPPreference = async () => {
  try {
    // eslint-disable-next-line no-undef
    await chrome.storage.local.set({ worldbookWebMCPEnabled: worldbookWebMCPEnabled.value });
    console.log(`Worldbook WebMCP preference saved: ${worldbookWebMCPEnabled.value}`);
  } catch (error) {
    console.error('Failed to save Worldbook WebMCP preference:', error);
  }
};

const loadWorldbookWebMCPPreference = async () => {
  try {
    // eslint-disable-next-line no-undef
    const result = await chrome.storage.local.get(['worldbookWebMCPEnabled']);
    // Default to true, only disable if explicitly set to false
    if (result.worldbookWebMCPEnabled !== undefined) {
      worldbookWebMCPEnabled.value = result.worldbookWebMCPEnabled;
    } else {
      worldbookWebMCPEnabled.value = true; // Enable by default
    }
    console.log(`Worldbook WebMCP preference loaded: ${worldbookWebMCPEnabled.value}`);
  } catch (error) {
    console.error('Failed to load Worldbook WebMCP preference:', error);
  }
};

const toggleDebugCoordinates = async () => {
  try {
    // Save preference to storage
    // eslint-disable-next-line no-undef
    await chrome.storage.local.set({ debugCoordinates: debugCoordinates.value });
    console.log(`Debug coordinates preference saved: ${debugCoordinates.value}`);

    // eslint-disable-next-line no-undef
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.TOGGLE_COORDINATE_DISPLAY,
      enabled: debugCoordinates.value,
    });
    if (response?.success) {
      console.log(`Debug coordinates ${debugCoordinates.value ? 'enabled' : 'disabled'}`);
    } else {
      console.error('Failed to toggle debug coordinates:', response?.error);
      // Revert the checkbox if failed
      debugCoordinates.value = !debugCoordinates.value;
      // eslint-disable-next-line no-undef
      await chrome.storage.local.set({ debugCoordinates: debugCoordinates.value });
    }
  } catch (error) {
    console.error('Failed to toggle debug coordinates:', error);
    // Revert the checkbox if failed
    debugCoordinates.value = !debugCoordinates.value;
  }
};

const loadDebugCoordinatesPreference = async () => {
  try {
    // eslint-disable-next-line no-undef
    const result = await chrome.storage.local.get(['debugCoordinates']);
    if (result.debugCoordinates !== undefined) {
      debugCoordinates.value = result.debugCoordinates;
    } else {
      debugCoordinates.value = false; // Disabled by default
    }
    console.log(`Debug coordinates preference loaded: ${debugCoordinates.value}`);
  } catch (error) {
    console.error('Failed to load debug coordinates preference:', error);
  }
};

const saveShowLastClickPreference = async () => {
  try {
    // eslint-disable-next-line no-undef
    await chrome.storage.local.set({ showLastClickOnScreenshot: showLastClickOnScreenshot.value });
    console.log(`Show last click preference saved: ${showLastClickOnScreenshot.value}`);
  } catch (error) {
    console.error('Failed to save show last click preference:', error);
  }
};

const loadShowLastClickPreference = async () => {
  try {
    // eslint-disable-next-line no-undef
    const result = await chrome.storage.local.get(['showLastClickOnScreenshot']);
    if (result.showLastClickOnScreenshot !== undefined) {
      showLastClickOnScreenshot.value = result.showLastClickOnScreenshot;
    } else {
      showLastClickOnScreenshot.value = false; // Disabled by default
    }
    console.log(`Show last click preference loaded: ${showLastClickOnScreenshot.value}`);
  } catch (error) {
    console.error('Failed to load show last click preference:', error);
  }
};

const saveModelState = async () => {
  try {
    const modelState = {
      status: modelInitializationStatus.value,
      downloadProgress: modelDownloadProgress.value,
      isDownloading: isModelDownloading.value,
      lastUpdated: Date.now(),
    };
    // eslint-disable-next-line no-undef
    await chrome.storage.local.set({ modelState });
  } catch (error) {
    console.error('保存模型状态失败:', error);
  }
};

let statusMonitoringInterval: ReturnType<typeof setInterval> | null = null;
let semanticEngineStatusPollingInterval: ReturnType<typeof setInterval> | null = null;

const startModelStatusMonitoring = () => {
  if (statusMonitoringInterval) {
    clearInterval(statusMonitoringInterval);
  }

  statusMonitoringInterval = setInterval(async () => {
    try {
      // eslint-disable-next-line no-undef
      const response = await chrome.runtime.sendMessage({
        type: 'get_model_status',
      });

      if (response && response.success) {
        const status = response.status;
        modelInitializationStatus.value = status.initializationStatus || 'idle';
        modelDownloadProgress.value = status.downloadProgress || 0;
        isModelDownloading.value = status.isDownloading || false;

        if (status.initializationStatus === 'error') {
          modelErrorMessage.value = status.errorMessage || getMessage('modelFailedStatus');
          modelErrorType.value = status.errorType || 'unknown';
        } else {
          modelErrorMessage.value = '';
          modelErrorType.value = '';
        }

        await saveModelState();

        if (status.initializationStatus === 'ready' || status.initializationStatus === 'error') {
          stopModelStatusMonitoring();
        }
      }
    } catch (error) {
      console.error('获取模型状态失败:', error);
    }
  }, 1000);
};

const stopModelStatusMonitoring = () => {
  if (statusMonitoringInterval) {
    clearInterval(statusMonitoringInterval);
    statusMonitoringInterval = null;
  }
};

const startSemanticEngineStatusPolling = () => {
  if (semanticEngineStatusPollingInterval) {
    clearInterval(semanticEngineStatusPollingInterval);
  }

  semanticEngineStatusPollingInterval = setInterval(async () => {
    try {
      await checkSemanticEngineStatus();
    } catch (error) {
      console.error('Semantic engine status polling failed:', error);
    }
  }, 2000);
};

const stopSemanticEngineStatusPolling = () => {
  if (semanticEngineStatusPollingInterval) {
    clearInterval(semanticEngineStatusPollingInterval);
    semanticEngineStatusPollingInterval = null;
  }
};

const refreshStorageStats = async () => {
  if (isRefreshingStats.value) return;

  isRefreshingStats.value = true;
  try {
    console.log('🔄 Refreshing storage statistics...');

    // eslint-disable-next-line no-undef
    const response = await chrome.runtime.sendMessage({
      type: 'get_storage_stats',
    });

    if (response && response.success) {
      storageStats.value = {
        indexedPages: response.stats.indexedPages || 0,
        totalDocuments: response.stats.totalDocuments || 0,
        totalTabs: response.stats.totalTabs || 0,
        indexSize: response.stats.indexSize || 0,
        isInitialized: response.stats.isInitialized || false,
      };
      console.log('✅ Storage stats refreshed:', storageStats.value);
    } else {
      console.error('❌ Failed to get storage stats:', response?.error);
      storageStats.value = {
        indexedPages: 0,
        totalDocuments: 0,
        totalTabs: 0,
        indexSize: 0,
        isInitialized: false,
      };
    }
  } catch (error) {
    console.error('❌ Error refreshing storage stats:', error);
    storageStats.value = {
      indexedPages: 0,
      totalDocuments: 0,
      totalTabs: 0,
      indexSize: 0,
      isInitialized: false,
    };
  } finally {
    isRefreshingStats.value = false;
  }
};

const hideClearDataConfirmation = () => {
  showClearConfirmation.value = false;
};

const confirmClearAllData = async () => {
  if (isClearingData.value) return;

  isClearingData.value = true;
  clearDataProgress.value = getMessage('clearingStatus');

  try {
    console.log('🗑️ Starting to clear all data...');

    // eslint-disable-next-line no-undef
    const response = await chrome.runtime.sendMessage({
      type: 'clear_all_data',
    });

    if (response && response.success) {
      clearDataProgress.value = getMessage('dataClearedNotification');
      console.log('✅ All data cleared successfully');

      await refreshStorageStats();

      setTimeout(() => {
        clearDataProgress.value = '';
        hideClearDataConfirmation();
      }, 2000);
    } else {
      throw new Error(response?.error || 'Failed to clear data');
    }
  } catch (error: any) {
    console.error('❌ Failed to clear all data:', error);
    clearDataProgress.value = `Failed to clear data: ${error?.message || 'Unknown error'}`;

    setTimeout(() => {
      clearDataProgress.value = '';
    }, 5000);
  } finally {
    isClearingData.value = false;
  }
};

const switchModel = async (newModel: ModelPreset) => {
  console.log(`🔄 switchModel called with newModel: ${newModel}`);

  if (isModelSwitching.value) {
    console.log('⏸️ Model switch already in progress, skipping');
    return;
  }

  const isSameModel = newModel === currentModel.value;
  const currentModelInfo = currentModel.value
    ? getModelInfo(currentModel.value)
    : getModelInfo('multilingual-e5-small');
  const newModelInfo = getModelInfo(newModel);
  const isDifferentDimension = currentModelInfo.dimension !== newModelInfo.dimension;

  console.log(`📊 Switch analysis:`);
  console.log(`   - Same model: ${isSameModel} (${currentModel.value} -> ${newModel})`);
  console.log(
    `   - Current dimension: ${currentModelInfo.dimension}, New dimension: ${newModelInfo.dimension}`,
  );
  console.log(`   - Different dimension: ${isDifferentDimension}`);

  if (isSameModel && !isDifferentDimension) {
    console.log('✅ Same model and dimension - no need to switch');
    return;
  }

  const switchReasons = [];
  if (!isSameModel) switchReasons.push('different model');
  if (isDifferentDimension) switchReasons.push('different dimension');

  console.log(`🚀 Switching model due to: ${switchReasons.join(', ')}`);
  console.log(
    `📋 Model: ${currentModel.value} (${currentModelInfo.dimension}D) -> ${newModel} (${newModelInfo.dimension}D)`,
  );

  isModelSwitching.value = true;
  modelSwitchProgress.value = getMessage('switchingModelStatus');

  modelInitializationStatus.value = 'downloading';
  modelDownloadProgress.value = 0;
  isModelDownloading.value = true;

  try {
    await saveModelPreference(newModel);
    await saveVersionPreference('quantized');
    await saveModelState();

    modelSwitchProgress.value = getMessage('semanticEngineInitializingStatus');

    startModelStatusMonitoring();

    // eslint-disable-next-line no-undef
    const response = await chrome.runtime.sendMessage({
      type: 'switch_semantic_model',
      modelPreset: newModel,
      modelVersion: 'quantized',
      modelDimension: newModelInfo.dimension,
      previousDimension: currentModelInfo.dimension,
    });

    if (response && response.success) {
      currentModel.value = newModel;
      modelSwitchProgress.value = getMessage('successNotification');
      console.log(
        '模型切换成功:',
        newModel,
        'version: quantized',
        'dimension:',
        newModelInfo.dimension,
      );

      modelInitializationStatus.value = 'ready';
      isModelDownloading.value = false;
      await saveModelState();

      setTimeout(() => {
        modelSwitchProgress.value = '';
      }, 2000);
    } else {
      throw new Error(response?.error || 'Model switch failed');
    }
  } catch (error: any) {
    console.error('模型切换失败:', error);
    modelSwitchProgress.value = `Model switch failed: ${error?.message || 'Unknown error'}`;

    modelInitializationStatus.value = 'error';
    isModelDownloading.value = false;

    const errorMessage = error?.message || '未知错误';
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('fetch') ||
      errorMessage.includes('timeout')
    ) {
      modelErrorType.value = 'network';
      modelErrorMessage.value = getMessage('networkErrorMessage');
    } else if (
      errorMessage.includes('corrupt') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('format')
    ) {
      modelErrorType.value = 'file';
      modelErrorMessage.value = getMessage('modelCorruptedErrorMessage');
    } else {
      modelErrorType.value = 'unknown';
      modelErrorMessage.value = errorMessage;
    }

    await saveModelState();

    setTimeout(() => {
      modelSwitchProgress.value = '';
    }, 8000);
  } finally {
    isModelSwitching.value = false;
  }
};

const setupServerStatusListener = () => {
  // eslint-disable-next-line no-undef
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === BACKGROUND_MESSAGE_TYPES.SERVER_STATUS_CHANGED && message.payload) {
      serverStatus.value = message.payload;
      console.log('Server status updated:', message.payload);
    }
  });
};

onMounted(async () => {
  await loadPortPreference();
  await loadWorldbookWebMCPPreference();
  await loadDebugCoordinatesPreference();
  await loadShowLastClickPreference();
  if (showRecorderUi) {
    await refreshRecorderPanel();
  }
  await loadModelPreference();
  await checkNativeConnection();
  await checkServerStatus();
  await checkNativeHostVersion();
  await refreshStorageStats();
  await loadCacheStats();

  await checkSemanticEngineStatus();
  setupServerStatusListener();
});

onUnmounted(() => {
  stopModelStatusMonitoring();
  stopSemanticEngineStatusPolling();
});
</script>

<style scoped>
.popup-container {
  background: #f1f5f9;
  border-radius: 24px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.header {
  flex-shrink: 0;
  padding-left: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title-group {
  display: flex;
  flex-direction: column;
}

.header-title {
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.build-version {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

.recorder-card {
  gap: 14px;
}

.recorder-quick-card {
  gap: 12px;
  border: 1px solid #fecaca;
  background: linear-gradient(180deg, #fff1f2 0%, #ffffff 100%);
}

.workflow-export-card {
  gap: 14px;
}

.workflow-export-block,
.workflow-saved-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workflow-editor-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workflow-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workflow-range-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.workflow-range-label {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}

.workflow-range-input {
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #fff;
  color: #0f172a;
  box-sizing: border-box;
  font-size: 12px;
}

.workflow-range-hint {
  margin: -2px 0 0;
}

.workflow-action-button {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #fff;
  color: #334155;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.workflow-action-button:hover:not(:disabled) {
  border-color: #94a3b8;
  background: #f8fafc;
}

.workflow-action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.workflow-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 70px;
  height: 28px;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 12px;
  font-weight: 700;
  padding: 0 10px;
}

.workflow-empty-text {
  margin-left: 0;
}

.workflow-editor {
  min-height: 220px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
}

.workflow-params-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.workflow-param-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workflow-param-label {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}

.workflow-param-meta {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
}

.workflow-param-description {
  font-size: 12px;
  color: #64748b;
}

.workflow-param-input {
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #fff;
  color: #0f172a;
  box-sizing: border-box;
}

.workflow-param-textarea {
  min-height: 120px;
}

.workflow-param-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #334155;
}

.recorder-url {
  word-break: break-all;
}

.recorder-error {
  margin: 0;
  color: #b91c1c;
  font-size: 12px;
  line-height: 1.5;
}

.recorder-textarea {
  width: 100%;
  min-height: 84px;
  padding: 12px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  background: #fff;
  color: #0f172a;
  resize: vertical;
  font: inherit;
  box-sizing: border-box;
}

.recorder-actions {
  display: flex;
  gap: 10px;
}

.record-button {
  flex: 1;
  border: none;
  border-radius: 14px;
  padding: 12px 16px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
}

.record-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.record-start {
  background: linear-gradient(135deg, #0f766e, #0ea5a4);
}

.record-stop {
  background: linear-gradient(135deg, #b91c1c, #ef4444);
}

.recorder-inline-actions {
  display: flex;
  gap: 8px;
}

.recorder-json {
  max-height: 280px;
  overflow: auto;
}

.recorded-tools-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recorded-tools-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.recorded-tool-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 14px;
  padding: 12px;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.recorded-tool-item:hover {
  border-color: #60a5fa;
  background: #dbeafe;
}

.recorded-tool-item-active {
  border-color: #0284c7;
  background: #e0f2fe;
  box-shadow: 0 0 0 1px rgba(2, 132, 199, 0.18);
}

.recorded-tool-meta {
  min-width: 0;
}

.recorded-tool-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.recorded-tool-name {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.recorded-tool-description {
  margin: 4px 0 0;
  font-size: 13px;
  color: #334155;
}

.recorded-tool-details {
  margin: 6px 0 0;
  font-size: 12px;
  color: #64748b;
}

.recorded-tool-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.delete-tool-button {
  background: #fff1f2;
  color: #be123c;
}

.settings-button {
  padding: 8px;
  border-radius: 50%;
  color: #64748b;
  background: none;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.settings-button:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.content {
  flex-grow: 1;
  padding: 8px 24px;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.content::-webkit-scrollbar {
  display: none;
}
.status-card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  padding: 20px;
  margin-bottom: 20px;
}

.status-label {
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
  margin-bottom: 8px;
}

.status-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  height: 8px;
  width: 8px;
  border-radius: 50%;
}

.status-dot.bg-emerald-500 {
  background-color: #10b981;
}

.status-dot.bg-red-500 {
  background-color: #ef4444;
}

.status-dot.bg-yellow-500 {
  background-color: #eab308;
}

.status-dot.bg-gray-500 {
  background-color: #6b7280;
}

.status-text {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.model-label {
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
  margin-bottom: 4px;
}

.model-name {
  font-weight: 600;
  color: #7c3aed;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.stats-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  padding: 16px;
}

.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.stats-label {
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
}

.stats-icon {
  padding: 8px;
  border-radius: 8px;
}

.stats-icon.violet {
  background: #ede9fe;
  color: #7c3aed;
}

.stats-icon.teal {
  background: #ccfbf1;
  color: #0d9488;
}

.stats-icon.blue {
  background: #dbeafe;
  color: #2563eb;
}

.stats-icon.green {
  background: #dcfce7;
  color: #16a34a;
}

.stats-value {
  font-size: 30px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.section {
  margin-bottom: 24px;
}

.secondary-button {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.secondary-button:hover:not(:disabled) {
  background: #e2e8f0;
  border-color: #94a3b8;
}

.secondary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary-button {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.primary-button:hover {
  background: #2563eb;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
}
.current-model-card {
  background: linear-gradient(135deg, #faf5ff, #f3e8ff);
  border: 1px solid #e9d5ff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.current-model-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.current-model-label {
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
  margin: 0;
}

.current-model-badge {
  background: #8b5cf6;
  color: white;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
}

.current-model-name {
  font-size: 16px;
  font-weight: 700;
  color: #7c3aed;
  margin: 0;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.model-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  border: 1px solid #e5e7eb;
  transition: all 0.2s ease;
}

.model-card:hover {
  border-color: #8b5cf6;
}

.model-card.selected {
  border: 2px solid #8b5cf6;
  background: #faf5ff;
}

.model-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.model-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.model-info {
  flex: 1;
}

.model-name {
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 4px 0;
}

.model-name.selected-text {
  color: #7c3aed;
}

.model-description {
  font-size: 14px;
  color: #64748b;
  margin: 0;
}

.check-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  background: #8b5cf6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.model-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}
.model-tag {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
}

.model-tag.performance {
  background: #d1fae5;
  color: #065f46;
}

.model-tag.size {
  background: #ddd6fe;
  color: #5b21b6;
}

.model-tag.dimension {
  background: #e5e7eb;
  color: #4b5563;
}

.config-card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.semantic-engine-card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.semantic-engine-status {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.semantic-engine-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #8b5cf6;
  color: white;
  font-weight: 600;
  padding: 12px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.semantic-engine-button:hover:not(:disabled) {
  background: #7c3aed;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.semantic-engine-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.refresh-status-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 14px;
  color: #64748b;
  transition: all 0.2s ease;
}

.refresh-status-button:hover {
  background: #f1f5f9;
  color: #374151;
}

.status-timestamp {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 4px;
}

.version-warning {
  display: flex;
  gap: 12px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  padding: 12px;
  margin-top: 12px;
}

.warning-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.warning-content {
  flex: 1;
}

.warning-title {
  font-size: 14px;
  font-weight: 600;
  color: #92400e;
  margin: 0 0 4px 0;
}

.warning-message {
  font-size: 12px;
  color: #a16207;
  margin: 0 0 8px 0;
}

.warning-command {
  font-size: 12px;
  color: #78350f;
  margin: 0;
}

.warning-command code {
  background: #fde68a;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
  font-size: 11px;
}

.version-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
}

.version-label {
  color: #94a3b8;
}

.version-value {
  color: #10b981;
  font-weight: 500;
}

.mcp-config-section {
  border-top: 1px solid #f1f5f9;
}

.mcp-config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.mcp-config-label {
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
  margin: 0;
}

.copy-config-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 14px;
  color: #64748b;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 4px;
}

.copy-config-button:hover {
  background: #f1f5f9;
  color: #374151;
}

.mcp-config-content {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
}

.mcp-config-json {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.4;
  color: #374151;
  margin: 0;
  white-space: pre;
  overflow-x: auto;
}

.port-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.port-label {
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
}

.port-input {
  display: block;
  width: 100%;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  padding: 12px;
  font-size: 14px;
  background: #f8fafc;
}

.port-input:focus {
  outline: none;
  border-color: #8b5cf6;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
}

.connect-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #8b5cf6;
  color: white;
  font-weight: 600;
  padding: 12px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.connect-button:hover:not(:disabled) {
  background: #7c3aed;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.connect-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.webmcp-option {
  border-top: 1px solid #f1f5f9;
  padding-top: 16px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  width: 18px;
  height: 18px;
  accent-color: #8b5cf6;
  cursor: pointer;
}

.checkbox-text {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #e5e7eb;
  color: #6b7280;
  font-size: 11px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s;
}

.help-icon:hover {
  background: #8b5cf6;
  color: white;
}

.option-description {
  font-size: 12px;
  color: #9ca3af;
  margin: 4px 0 0 26px;
}
.error-card {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.error-content {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.error-icon {
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.error-details {
  flex: 1;
}

.error-title {
  font-size: 14px;
  font-weight: 600;
  color: #dc2626;
  margin: 0 0 4px 0;
}

.error-message {
  font-size: 14px;
  color: #991b1b;
  margin: 0 0 8px 0;
  font-weight: 500;
}

.error-suggestion {
  font-size: 13px;
  color: #7f1d1d;
  margin: 0;
  line-height: 1.4;
}

.retry-button {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #dc2626;
  color: white;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  flex-shrink: 0;
}

.retry-button:hover:not(:disabled) {
  background: #b91c1c;
}

.retry-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.danger-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: white;
  border: 1px solid #d1d5db;
  color: #374151;
  font-weight: 600;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 16px;
}

.danger-button:hover:not(:disabled) {
  border-color: #ef4444;
  color: #dc2626;
}

.danger-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.icon-small {
  width: 14px;
  height: 14px;
}

.icon-default {
  width: 20px;
  height: 20px;
}

.icon-medium {
  width: 24px;
  height: 24px;
}
.footer {
  padding: 16px;
  margin-top: auto;
}

.footer-text {
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
}

@media (max-width: 320px) {
  .popup-container {
    width: 100%;
    height: 100vh;
    border-radius: 0;
  }

  .header {
    padding: 24px 20px 12px;
  }

  .content {
    padding: 8px 20px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .config-card {
    padding: 16px;
    gap: 12px;
  }

  .current-model-card {
    padding: 12px;
    margin-bottom: 12px;
  }

  .stats-card {
    padding: 12px;
  }

  .stats-value {
    font-size: 24px;
  }
}
</style>
