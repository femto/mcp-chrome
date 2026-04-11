<template>
  <div class="panel-shell">
    <header class="panel-header">
      <div>
        <p class="eyebrow">WebMCP</p>
        <h1 class="panel-title">Workflow Recorder</h1>
      </div>
      <button class="ghost-button" @click="refreshAll">Refresh</button>
    </header>

    <section class="hero-card">
      <div class="hero-topline">
        <span :class="['status-pill', recorderState.isRecording ? 'recording' : 'idle']">
          {{ recorderState.isRecording ? 'Recording' : 'Ready' }}
        </span>
        <span class="hero-meta"> {{ timelineSteps.length }} steps </span>
      </div>
      <h2 class="hero-title">
        {{
          recorderState.isRecording ? recorderState.toolName : 'Capture a reusable browser workflow'
        }}
      </h2>
      <p class="hero-description">
        {{ recorderState.isRecording ? recorderState.description : recordabilityHint }}
      </p>
      <p class="hero-url">{{
        recorderState.url || activeTabUrl || 'No active web page detected'
      }}</p>
      <div class="hero-actions">
        <button
          class="primary-button"
          :disabled="isStartingRecorder || recorderState.isRecording || !isRecordableActiveTab"
          @click="startRecording"
        >
          {{ isStartingRecorder ? 'Starting…' : 'Start Recording' }}
        </button>
        <button
          class="danger-button"
          :disabled="isStoppingRecorder || !recorderState.isRecording"
          @click="stopRecording"
        >
          {{ isStoppingRecorder ? 'Saving…' : 'Stop Recording' }}
        </button>
      </div>
      <p v-if="continueRecordingError" class="timeline-detail continue-recording-error">
        {{ continueRecordingError }}
      </p>
    </section>

    <section class="editor-card">
      <div class="section-heading">
        <h2>Recorder Setup</h2>
        <span>{{ currentHostname || 'Current tab' }}</span>
      </div>
      <label class="field-label" for="recorder-tool-name">Tool Name</label>
      <input
        id="recorder-tool-name"
        v-model="recorderToolName"
        class="text-input"
        :disabled="recorderState.isRecording"
        placeholder="wechat_publish_login"
      />
      <label class="field-label" for="recorder-description">Description</label>
      <textarea
        id="recorder-description"
        v-model="recorderDescription"
        class="text-area"
        :disabled="recorderState.isRecording"
        placeholder="Describe what the workflow should do when replayed"
      />
    </section>

    <section v-if="lastRecordedToolId" class="current-workflow-card">
      <div class="section-heading">
        <h2>Current Workflow</h2>
        <span>Loaded</span>
      </div>
      <h3 class="current-workflow-title">{{ recorderToolName || 'Recorded workflow' }}</h3>
      <p v-if="recorderDescription" class="current-workflow-description">{{
        recorderDescription
      }}</p>
      <p class="timeline-detail">
        {{ activeWorkflowStepCount }} steps
        <span v-if="currentHostname"> · {{ currentHostname }}</span>
      </p>
      <div class="workflow-range-row">
        <label
          class="field-label workflow-range-label"
          for="sidepanel-current-workflow-replay-range"
          >Steps</label
        >
        <input
          id="sidepanel-current-workflow-replay-range"
          v-model="replayStepSelectionInput"
          type="text"
          class="text-input workflow-range-input"
          placeholder="All steps or e.g. 1, 3-7, 9-"
          spellcheck="false"
        />
      </div>
      <p class="timeline-detail workflow-range-hint">
        Leave empty to replay all steps. Supports single numbers, ranges, and open-ended ranges.
      </p>
      <div class="inline-actions">
        <button
          class="ghost-button"
          :disabled="isStartingRecorder || recorderState.isRecording || !canContinueRecording"
          @click="continueRecording"
        >
          {{
            isStartingRecorder && continueRecordingRequested ? 'Continuing…' : 'Continue Recording'
          }}
        </button>
        <button
          class="ghost-button"
          :disabled="!lastRecordedToolId || replayingToolId === lastRecordedToolId"
          @click="replayLatestWorkflow"
        >
          {{ replayingToolId === lastRecordedToolId ? 'Replaying…' : 'Replay' }}
        </button>
        <button
          class="ghost-button"
          :disabled="!lastRecordedWorkflowJson"
          @click="copyLatestWorkflowJson"
        >
          {{ workflowCopyButtonText }}
        </button>
        <button
          class="ghost-button"
          :disabled="!lastRecordedWebMcpJson"
          @click="copyLatestWebMcpJson"
        >
          {{ webmcpCopyButtonText }}
        </button>
        <button
          class="ghost-button"
          :disabled="!lastRecordedRawWorkflowJson"
          @click="copyLatestRawWorkflowJson"
        >
          {{ rawWorkflowCopyButtonText }}
        </button>
        <button
          class="ghost-button"
          :disabled="!lastRecordedToolId || refiningToolId === lastRecordedToolId"
          @click="refineLatestWorkflow"
        >
          {{ refiningToolId === lastRecordedToolId ? 'Refining…' : 'Refine Inputs' }}
        </button>
        <button
          class="ghost-button"
          :disabled="isSavingWorkflowEditor || !lastRecordedToolId"
          @click="saveWorkflowEditor"
        >
          {{ isSavingWorkflowEditor ? 'Saving…' : 'Save Workflow' }}
        </button>
        <button
          class="ghost-button"
          :disabled="isSavingWorkflowEditor || !lastRecordedWorkflowJson"
          @click="resetWorkflowEditor"
        >
          Reset
        </button>
      </div>
      <p v-if="workflowReplayStatus" class="timeline-detail">{{ workflowReplayStatus }}</p>
      <p v-if="workflowEditorStatus" class="timeline-detail">{{ workflowEditorStatus }}</p>
    </section>

    <section class="timeline-card">
      <div class="section-heading">
        <h2>Timeline</h2>
        <span>{{ timelineSummaryText }}</span>
      </div>
      <div v-if="timelineSteps.length" class="timeline-list">
        <article v-for="step in timelineSteps" :key="step.id" class="timeline-item">
          <div class="timeline-marker" />
          <div class="timeline-body">
            <div class="timeline-title-row">
              <h3 class="timeline-title">{{ step.title }}</h3>
              <span class="timeline-kind">{{ step.kind }}</span>
            </div>
            <p v-if="step.subtitle" class="timeline-subtitle">{{ step.subtitle }}</p>
            <p v-if="step.selector" class="timeline-detail">Selector: {{ step.selector }}</p>
            <p v-if="step.value !== undefined" class="timeline-detail">Value: {{ step.value }}</p>
            <p class="timeline-url">{{ step.url }}</p>
          </div>
        </article>
      </div>
      <div v-else class="empty-state">
        <p>No steps captured yet.</p>
        <span>Open a normal web page, then start recording from this side panel.</span>
      </div>
    </section>

    <section
      v-if="lastRecordedRawWorkflowJson || lastRecordedWorkflowJson || lastRecordedWebMcpJson"
      class="json-card"
    >
      <div class="section-heading">
        <h2>Latest JSON</h2>
        <div class="inline-actions">
          <button
            class="ghost-button"
            :disabled="!lastRecordedToolId || replayingToolId === lastRecordedToolId"
            @click="replayLatestWorkflow"
          >
            {{ replayingToolId === lastRecordedToolId ? 'Replaying…' : 'Replay' }}
          </button>
          <button
            class="ghost-button"
            :disabled="!lastRecordedWorkflowJson"
            @click="copyLatestWorkflowJson"
          >
            {{ workflowCopyButtonText }}
          </button>
          <button
            class="ghost-button"
            :disabled="!lastRecordedWebMcpJson"
            @click="copyLatestWebMcpJson"
          >
            {{ webmcpCopyButtonText }}
          </button>
          <button
            class="ghost-button"
            :disabled="!lastRecordedRawWorkflowJson"
            @click="copyLatestRawWorkflowJson"
          >
            {{ rawWorkflowCopyButtonText }}
          </button>
          <button
            class="ghost-button"
            :disabled="!lastRecordedWorkflowJson"
            @click="downloadLatestWorkflowJson"
          >
            Export Workflow
          </button>
          <button
            class="ghost-button"
            :disabled="!lastRecordedWebMcpJson"
            @click="downloadLatestWebMcpJson"
          >
            Export WebMCP
          </button>
          <button
            class="ghost-button"
            :disabled="!lastRecordedRawWorkflowJson"
            @click="downloadLatestRawWorkflowJson"
          >
            Export Raw
          </button>
          <button
            class="ghost-button"
            :disabled="!lastRecordedToolId || refiningToolId === lastRecordedToolId"
            @click="refineLatestWorkflow"
          >
            {{ refiningToolId === lastRecordedToolId ? 'Refining…' : 'Refine Inputs' }}
          </button>
          <button
            class="ghost-button"
            :disabled="isSavingWorkflowEditor || !lastRecordedToolId"
            @click="saveWorkflowEditor"
          >
            {{ isSavingWorkflowEditor ? 'Saving…' : 'Save Workflow' }}
          </button>
          <button
            class="ghost-button"
            :disabled="isSavingWorkflowEditor || !lastRecordedWorkflowJson"
            @click="resetWorkflowEditor"
          >
            Reset
          </button>
        </div>
      </div>
      <div v-if="lastRecordedToolId" class="workflow-range-row">
        <label class="field-label workflow-range-label" for="sidepanel-workflow-replay-range"
          >Steps</label
        >
        <input
          id="sidepanel-workflow-replay-range"
          v-model="replayStepSelectionInput"
          type="text"
          class="text-input workflow-range-input"
          placeholder="All steps or e.g. 1, 3-7, 9-"
          spellcheck="false"
        />
      </div>
      <p v-if="lastRecordedToolId" class="timeline-detail workflow-range-hint">
        Leave empty to replay all steps. Supports single numbers, ranges, and open-ended ranges.
      </p>
      <p v-if="lastRecordedRawWorkflowJson" class="timeline-detail">Raw Workflow JSON</p>
      <pre v-if="lastRecordedRawWorkflowJson" class="json-block">{{
        lastRecordedRawWorkflowJson
      }}</pre>
      <p v-if="lastRecordedWorkflowJson" class="timeline-detail">Parameterized Workflow JSON</p>
      <textarea
        v-if="lastRecordedToolId"
        v-model="workflowEditorJson"
        class="text-area workflow-editor"
        spellcheck="false"
      />
      <p v-if="workflowEditorStatus" class="timeline-detail">{{ workflowEditorStatus }}</p>
      <p v-if="lastRecordedToolId" class="timeline-detail">Replay Params</p>
      <div
        v-if="lastRecordedToolId && activeWorkflowInputSchema.length"
        class="workflow-params-form"
      >
        <label
          v-for="field in activeWorkflowInputSchema"
          :key="field.name"
          class="workflow-param-field"
        >
          <span class="workflow-param-label">
            {{ field.name }}
            <span class="workflow-param-meta">{{ field.required ? 'Required' : 'Optional' }}</span>
          </span>
          <span v-if="field.description" class="workflow-param-description">{{
            field.description
          }}</span>
          <label v-if="field.type === 'boolean'" class="workflow-param-checkbox">
            <input v-model="replayFormValues[field.name]" type="checkbox" />
            <span>{{ replayFormValues[field.name] ? 'true' : 'false' }}</span>
          </label>
          <textarea
            v-else-if="isReplayTextareaField(field)"
            v-model="replayFormValues[field.name]"
            class="text-area workflow-param-textarea"
            spellcheck="false"
          />
          <input
            v-else
            v-model="replayFormValues[field.name]"
            type="text"
            class="text-input workflow-param-input"
            spellcheck="false"
          />
        </label>
      </div>
      <p v-else-if="lastRecordedToolId" class="timeline-detail"
        >This workflow has no parameterized inputs.</p
      >
      <p v-if="workflowReplayStatus" class="timeline-detail">{{ workflowReplayStatus }}</p>
      <pre v-if="lastRecordedWorkflowJson" class="json-block">{{ lastRecordedWorkflowJson }}</pre>
      <p v-if="lastRecordedWebMcpJson" class="timeline-detail">WebMCP Tool JSON</p>
      <pre v-if="lastRecordedWebMcpJson" class="json-block">{{ lastRecordedWebMcpJson }}</pre>
    </section>

    <section class="saved-card">
      <div class="section-heading">
        <h2>Saved Workflows</h2>
        <span>{{ savedRecordedTools.length }} for this site</span>
      </div>
      <div v-if="savedRecordedTools.length" class="saved-list">
        <article
          v-for="tool in savedRecordedTools"
          :key="tool.id"
          :class="['saved-item', { active: tool.id === lastRecordedToolId }]"
          @click="loadSavedWorkflow(tool)"
        >
          <div>
            <div class="saved-name-row">
              <h3 class="saved-name">{{ tool.name }}</h3>
              <span v-if="tool.id === lastRecordedToolId" class="timeline-kind">Loaded</span>
            </div>
            <p class="saved-description">{{ tool.description }}</p>
            <p class="saved-meta">
              {{ tool.actionCount }} actions · {{ new Date(tool.updatedAt).toLocaleString() }}
            </p>
          </div>
          <div class="saved-actions">
            <button class="ghost-button" @click.stop="loadSavedWorkflow(tool)">
              {{ tool.id === lastRecordedToolId ? 'Loaded' : 'Load' }}
            </button>
            <button
              class="ghost-button"
              :disabled="replayingToolId === tool.id"
              @click.stop="replaySavedWorkflow(tool.id)"
            >
              {{ replayingToolId === tool.id ? 'Replaying…' : 'Replay' }}
            </button>
            <button class="ghost-button" @click.stop="copySavedWorkflow(tool)"
              >Copy Workflow</button
            >
            <button class="ghost-button" @click.stop="copySavedWebMcp(tool)">Copy WebMCP</button>
            <button class="ghost-button" @click.stop="copySavedRawWorkflow(tool)">Copy Raw</button>
            <button
              class="ghost-button"
              :disabled="refiningToolId === tool.id"
              @click.stop="refineSavedWorkflow(tool.id)"
            >
              {{ refiningToolId === tool.id ? 'Refining…' : 'Refine Inputs' }}
            </button>
            <button class="ghost-button danger-text" @click.stop="deleteRecordedTool(tool.id)">
              Delete
            </button>
          </div>
        </article>
      </div>
      <div v-else class="empty-state">
        <p>No saved workflows for this site.</p>
        <span>Save one recording and it will appear here.</span>
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';

type RecorderState = {
  isRecording: boolean;
  tabId: number | null;
  toolName: string;
  description: string;
  url: string | null;
  actionCount: number;
  startedAt: number | null;
};

type RecordedAction = {
  type: 'click' | 'input' | 'change' | 'submit';
  selector: string;
  cssSelector?: string;
  xpath?: string;
  targetText?: string;
  url: string;
  timestamp: number;
  label?: string;
  value?: string | boolean;
  fieldType?: string;
};

type SavedToolItem = {
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
};

const activeTabUrl = ref('');
const activeTabId = ref<number | null>(null);
const recorderToolName = ref('');
const recorderDescription = ref('');
const isStartingRecorder = ref(false);
const isStoppingRecorder = ref(false);
const continueRecordingRequested = ref(false);
const continueRecordingError = ref('');
const lastRecordedRawWorkflowJson = ref('');
const lastRecordedWorkflowJson = ref('');
const lastRecordedWebMcpJson = ref('');
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
const rawWorkflowCopyButtonText = ref('Copy Raw');
const workflowCopyButtonText = ref('Copy Workflow');
const webmcpCopyButtonText = ref('Copy WebMCP');
const sessionActions = ref<RecordedAction[]>([]);
const savedRecordedTools = ref<SavedToolItem[]>([]);
const recorderState = ref<RecorderState>({
  isRecording: false,
  tabId: null,
  toolName: '',
  description: '',
  url: null,
  actionCount: 0,
  startedAt: null,
});

const isRecordableActiveTab = computed(() => /^https?:\/\//.test(activeTabUrl.value));

const currentHostname = computed(() => {
  const candidate = recorderState.value.url || activeTabUrl.value;
  if (!candidate) return '';
  try {
    return new URL(candidate).hostname;
  } catch {
    return '';
  }
});

const recordabilityHint = computed(() => {
  if (isRecordableActiveTab.value) {
    return 'Use the side panel while operating the target site. Every click and form interaction will be captured.';
  }
  return 'Switch to a normal http(s) tab first. Chrome internal pages and extension pages cannot be recorded.';
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

const activeWorkflowStepCount = computed(() => {
  const steps = activeWorkflowDoc.value?.steps;
  return Array.isArray(steps) ? steps.length : 0;
});

const timelineSummaryText = computed(() => {
  if (recorderState.value.isRecording) {
    return `${recorderState.value.actionCount} captured actions`;
  }
  if (activeWorkflowStepCount.value > 0) {
    return `${Math.max(activeWorkflowStepCount.value - 1, 0)} workflow steps`;
  }
  return '0 captured actions';
});

const canContinueRecording = computed(() => {
  if (
    !lastRecordedToolId.value ||
    recorderState.value.isRecording ||
    !isRecordableActiveTab.value
  ) {
    return false;
  }
  const workflowHostname = activeWorkflowDoc.value?.hostname;
  return !workflowHostname || workflowHostname === currentHostname.value;
});

const timelineSteps = computed(() => {
  const loadedWorkflowSteps = Array.isArray(activeWorkflowDoc.value?.steps)
    ? activeWorkflowDoc.value.steps
    : [];
  const isShowingLoadedWorkflow =
    !recorderState.value.isRecording &&
    sessionActions.value.length === 0 &&
    loadedWorkflowSteps.length > 0;
  const url = recorderState.value.url || activeWorkflowDoc.value?.startUrl || activeTabUrl.value;
  const items: Array<{
    id: string;
    title: string;
    subtitle?: string;
    selector?: string;
    url: string;
    kind: string;
    value?: string;
  }> = [];

  if (url) {
    items.push({
      id: `navigate:${url}`,
      title: `Navigate to ${url}`,
      url,
      kind: 'navigate',
    });
  }

  if (isShowingLoadedWorkflow) {
    loadedWorkflowSteps
      .filter((step: any, index: number) => !(step?.type === 'navigate' && index === 0))
      .forEach((step: any, index: number) => {
        const selector =
          step?.target?.cssSelector ||
          step?.target?.xpath ||
          step?.target?.idAttr ||
          step?.target?.nameAttr ||
          '';
        const value =
          typeof step?.value === 'string'
            ? step.value.length > 80
              ? `${step.value.slice(0, 77)}...`
              : step.value
            : typeof step?.value === 'boolean'
              ? String(step.value)
              : undefined;

        items.push({
          id: String(step?.id || `workflow-step-${index + 1}`),
          title: step?.description || `Step ${index + 2}`,
          subtitle: step?.target?.elementTag
            ? `Element: ${step.target.elementTag}`
            : step?.paramName
              ? `Input: ${step.paramName}`
              : undefined,
          selector: selector || undefined,
          url: step?.url || activeWorkflowDoc.value?.startUrl || activeTabUrl.value || '',
          kind: step?.type || 'step',
          value,
        });
      });

    return items;
  }

  sessionActions.value.forEach((action, index) => {
    const titleByType = {
      click: `Click ${action.label || action.targetText || action.selector}`,
      input: `Input into ${action.label || action.targetText || action.selector}`,
      change: `Change ${action.label || action.targetText || action.selector}`,
      submit: `Submit ${action.label || action.targetText || action.selector}`,
    };

    items.push({
      id: `${action.timestamp}:${index}`,
      title: titleByType[action.type],
      subtitle: action.fieldType ? `Field type: ${action.fieldType}` : undefined,
      selector: action.selector,
      url: action.url,
      kind: action.type,
      value:
        typeof action.value === 'boolean'
          ? String(action.value)
          : typeof action.value === 'string' && action.value.length > 80
            ? `${action.value.slice(0, 77)}...`
            : action.value,
    });
  });

  return items;
});

function buildDefaultRecordedToolName(url: string): string {
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
}

async function loadActiveTabContext() {
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
}

async function loadRecorderSession() {
  const response = await chrome.runtime.sendMessage({
    type: BACKGROUND_MESSAGE_TYPES.GET_WEBMCP_RECORDING_SESSION,
  });

  if (!response?.success) return;

  const session = response.session;
  if (!session) {
    recorderState.value = {
      isRecording: false,
      tabId: null,
      toolName: '',
      description: '',
      url: null,
      actionCount: 0,
      startedAt: null,
    };
    sessionActions.value = [];
    return;
  }

  recorderState.value = {
    isRecording: session.isRecording,
    tabId: session.tabId,
    toolName: session.toolName,
    description: session.description,
    url: session.url,
    actionCount: session.actionCount,
    startedAt: session.startedAt,
  };
  sessionActions.value = Array.isArray(session.actions) ? session.actions : [];
  recorderToolName.value = session.toolName;
  recorderDescription.value = session.description;
}

async function loadSavedRecordedTools() {
  const response = await chrome.runtime.sendMessage({
    type: BACKGROUND_MESSAGE_TYPES.LIST_LOCAL_WEBMCP_TOOLS,
  });

  if (!response?.success || !Array.isArray(response.tools)) {
    savedRecordedTools.value = [];
    return;
  }

  const hostname = currentHostname.value;
  savedRecordedTools.value = hostname
    ? response.tools.filter((tool: SavedToolItem) => tool.hostname === hostname)
    : response.tools;
}

async function refreshAll() {
  await loadActiveTabContext();
  await loadRecorderSession();
  await loadSavedRecordedTools();
}

async function startRecording() {
  if (isStartingRecorder.value || recorderState.value.isRecording) return;
  isStartingRecorder.value = true;
  continueRecordingRequested.value = false;
  continueRecordingError.value = '';
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
    await refreshAll();
  } finally {
    isStartingRecorder.value = false;
  }
}

async function continueRecording() {
  if (
    isStartingRecorder.value ||
    recorderState.value.isRecording ||
    !lastRecordedToolId.value ||
    !canContinueRecording.value
  ) {
    return;
  }

  isStartingRecorder.value = true;
  continueRecordingRequested.value = true;
  continueRecordingError.value = '';
  try {
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.START_WEBMCP_RECORDING,
      toolName: recorderToolName.value,
      description: recorderDescription.value,
      appendToToolId: lastRecordedToolId.value,
    });
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to continue recording');
    }
    setWorkflowEditorStatus('Continuing recording on current workflow');
    await refreshAll();
  } catch (error: any) {
    continueRecordingError.value = error?.message || 'Failed to continue recording';
  } finally {
    isStartingRecorder.value = false;
    continueRecordingRequested.value = false;
  }
}

async function stopRecording() {
  if (isStoppingRecorder.value || !recorderState.value.isRecording) return;
  isStoppingRecorder.value = true;
  continueRecordingError.value = '';
  try {
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.STOP_WEBMCP_RECORDING,
    });
    if (!response?.success || !response.savedTool) {
      throw new Error(response?.error || 'Failed to stop recording');
    }

    applyToolToWorkspace(response.savedTool as SavedToolItem);

    if (typeof response.tabId === 'number') {
      await chrome.runtime.sendMessage({
        type: 'webmcp:detect-tools',
        tabId: response.tabId,
      });
    }

    await refreshAll();
  } finally {
    isStoppingRecorder.value = false;
  }
}

async function copyLatestRawWorkflowJson() {
  if (!lastRecordedRawWorkflowJson.value) return;
  await navigator.clipboard.writeText(lastRecordedRawWorkflowJson.value);
  rawWorkflowCopyButtonText.value = 'Copied';
  window.setTimeout(() => {
    rawWorkflowCopyButtonText.value = 'Copy Raw';
  }, 1200);
}

async function copyLatestWorkflowJson() {
  if (!lastRecordedWorkflowJson.value) return;
  await navigator.clipboard.writeText(lastRecordedWorkflowJson.value);
  workflowCopyButtonText.value = 'Copied';
  window.setTimeout(() => {
    workflowCopyButtonText.value = 'Copy Workflow';
  }, 1200);
}

async function copyLatestWebMcpJson() {
  if (!lastRecordedWebMcpJson.value) return;
  await navigator.clipboard.writeText(lastRecordedWebMcpJson.value);
  webmcpCopyButtonText.value = 'Copied';
  window.setTimeout(() => {
    webmcpCopyButtonText.value = 'Copy WebMCP';
  }, 1200);
}

function downloadJson(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadLatestRawWorkflowJson() {
  if (!lastRecordedRawWorkflowJson.value) return;
  downloadJson(
    `${recorderToolName.value || 'recorded_workflow'}.raw.workflow.json`,
    lastRecordedRawWorkflowJson.value,
  );
}

async function downloadLatestWorkflowJson() {
  if (!lastRecordedWorkflowJson.value) return;
  downloadJson(
    `${recorderToolName.value || 'recorded_workflow'}.workflow.json`,
    lastRecordedWorkflowJson.value,
  );
}

async function downloadLatestWebMcpJson() {
  if (!lastRecordedWebMcpJson.value) return;
  downloadJson(
    `${recorderToolName.value || 'recorded_workflow'}.webmcp.json`,
    lastRecordedWebMcpJson.value,
  );
}

function setWorkflowEditorStatus(message: string) {
  workflowEditorStatus.value = message;
  window.setTimeout(() => {
    if (workflowEditorStatus.value === message) {
      workflowEditorStatus.value = '';
    }
  }, 2000);
}

function setWorkflowReplayStatus(message: string) {
  workflowReplayStatus.value = message;
  window.setTimeout(() => {
    if (workflowReplayStatus.value === message) {
      workflowReplayStatus.value = '';
    }
  }, 2500);
}

function buildDefaultReplayFormValues(workflow: Record<string, any>) {
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
}

function buildReplayParamsForSubmit(
  workflow: Record<string, any>,
  values: Record<string, string | boolean>,
) {
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
}

function applyToolToWorkspace(tool: SavedToolItem) {
  lastRecordedToolId.value = tool.id;
  recorderToolName.value = tool.name;
  recorderDescription.value = tool.description;
  lastRecordedRawWorkflowJson.value = JSON.stringify(
    tool.rawWorkflow || tool.workflow || tool.tool,
    null,
    2,
  );
  lastRecordedWorkflowJson.value = JSON.stringify(tool.workflow || tool.tool, null, 2);
  lastRecordedWebMcpJson.value = JSON.stringify(tool.tool, null, 2);
  activeWorkflowDoc.value = tool.workflow || tool.tool;
  workflowEditorJson.value = JSON.stringify(tool.workflow || tool.tool, null, 2);
  replayFormValues.value = buildDefaultReplayFormValues(tool.workflow || tool.tool);
}

function isReplayTextareaField(field: { name: string; description?: string }) {
  const hint = `${field.name} ${field.description || ''}`.toLowerCase();
  return /body|content|description|summary|message|正文|内容|描述|摘要/.test(hint);
}

async function refineSavedWorkflow(id: string) {
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

    applyToolToWorkspace(response.tool as SavedToolItem);
    await loadSavedRecordedTools();
  } catch (error) {
    console.error('Failed to refine workflow inputs:', error);
  } finally {
    refiningToolId.value = '';
  }
}

async function refineLatestWorkflow() {
  if (!lastRecordedToolId.value) return;
  await refineSavedWorkflow(lastRecordedToolId.value);
}

async function replaySavedWorkflow(id: string) {
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
}

async function replayLatestWorkflow() {
  if (!lastRecordedToolId.value) return;
  await replaySavedWorkflow(lastRecordedToolId.value);
}

function loadSavedWorkflow(tool: SavedToolItem) {
  applyToolToWorkspace(tool);
  setWorkflowEditorStatus('Loaded workflow into editor');
}

function resetWorkflowEditor() {
  if (!lastRecordedWorkflowJson.value) return;
  workflowEditorJson.value = lastRecordedWorkflowJson.value;
  workflowEditorStatus.value = '';
}

async function saveWorkflowEditor() {
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

    applyToolToWorkspace(response.tool as SavedToolItem);
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
}

async function copySavedRawWorkflow(tool: SavedToolItem) {
  await navigator.clipboard.writeText(
    JSON.stringify(tool.rawWorkflow || tool.workflow || tool.tool, null, 2),
  );
}

async function copySavedWorkflow(tool: SavedToolItem) {
  await navigator.clipboard.writeText(JSON.stringify(tool.workflow || tool.tool, null, 2));
}

async function copySavedWebMcp(tool: SavedToolItem) {
  await navigator.clipboard.writeText(JSON.stringify(tool.tool, null, 2));
}

async function deleteRecordedTool(id: string) {
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
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  await refreshAll();
  pollTimer = setInterval(() => {
    void refreshAll();
  }, 1200);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.panel-shell {
  min-height: 100vh;
  padding: 18px;
  color: var(--text-primary);
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--brand);
}

.panel-title {
  margin: 0;
  font-size: 28px;
  line-height: 1.1;
}

.hero-card,
.editor-card,
.current-workflow-card,
.timeline-card,
.json-card,
.saved-card {
  margin-bottom: 16px;
  padding: 18px;
  border: 1px solid var(--card-border);
  border-radius: 22px;
  background: var(--card-bg);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
}

.hero-card {
  background:
    linear-gradient(135deg, rgba(15, 118, 110, 0.1), rgba(59, 130, 246, 0.08)), var(--card-bg);
}

.current-workflow-card {
  background:
    linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(16, 185, 129, 0.08)), var(--card-bg);
}

.hero-topline,
.section-heading,
.timeline-title-row,
.saved-actions,
.inline-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.section-heading {
  margin-bottom: 14px;
}

.section-heading h2 {
  margin: 0;
  font-size: 16px;
}

.section-heading span,
.hero-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.status-pill.recording {
  background: rgba(220, 38, 38, 0.12);
  color: var(--danger);
}

.status-pill.idle {
  background: rgba(15, 118, 110, 0.12);
  color: var(--brand);
}

.hero-title {
  margin: 14px 0 8px;
  font-size: 22px;
  line-height: 1.2;
}

.current-workflow-title {
  margin: 0 0 6px;
  font-size: 20px;
  line-height: 1.2;
}

.current-workflow-description {
  margin: 0 0 8px;
  color: var(--text-secondary);
}

.continue-recording-error {
  color: var(--danger);
}

.hero-description,
.hero-url,
.timeline-subtitle,
.timeline-detail,
.timeline-url,
.saved-description,
.saved-meta,
.empty-state span {
  margin: 0;
  color: var(--text-secondary);
}

.hero-url,
.timeline-url {
  font-size: 12px;
  word-break: break-all;
  color: var(--text-muted);
}

.hero-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.primary-button,
.danger-button,
.ghost-button {
  border: 0;
  border-radius: 14px;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.16s ease,
    opacity 0.16s ease,
    background 0.16s ease;
}

.primary-button,
.danger-button {
  flex: 1;
  padding: 13px 16px;
  color: #fff;
}

.primary-button {
  background: linear-gradient(135deg, var(--brand), #14b8a6);
}

.danger-button {
  background: linear-gradient(135deg, var(--danger), var(--danger-strong));
}

.ghost-button {
  padding: 9px 12px;
  background: #fff;
  color: var(--text-primary);
  border: 1px solid rgba(15, 23, 42, 0.08);
}

.primary-button:disabled,
.danger-button:disabled,
.ghost-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.field-label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.text-input,
.text-area {
  width: 100%;
  margin-bottom: 14px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.94);
  color: var(--text-primary);
}

.text-input {
  min-height: 48px;
  padding: 0 14px;
}

.text-area {
  min-height: 96px;
  padding: 12px 14px;
  resize: vertical;
}

.timeline-list,
.saved-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timeline-item,
.saved-item {
  display: grid;
  grid-template-columns: 14px 1fr;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.saved-item {
  grid-template-columns: 1fr;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.saved-item:hover {
  border-color: rgba(15, 118, 110, 0.35);
  background: rgba(240, 253, 250, 0.92);
}

.saved-item.active {
  border-color: rgba(13, 148, 136, 0.48);
  background: rgba(204, 251, 241, 0.88);
  box-shadow: 0 0 0 1px rgba(13, 148, 136, 0.18);
}

.timeline-marker {
  width: 14px;
  height: 14px;
  margin-top: 4px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--brand), #38bdf8);
  box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.14);
}

.timeline-title,
.saved-name {
  margin: 0;
  font-size: 15px;
}

.saved-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.timeline-kind {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.json-block {
  margin: 0;
  max-height: 320px;
  overflow: auto;
  padding: 14px;
  border-radius: 16px;
  background: #0f172a;
  color: #dbeafe;
  font-size: 12px;
  line-height: 1.5;
}

.workflow-editor {
  min-height: 240px;
  margin-bottom: 12px;
  font-family: 'SFMono-Regular', 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  line-height: 1.5;
}

.workflow-range-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.workflow-range-label {
  margin-bottom: 0;
  white-space: nowrap;
}

.workflow-range-input {
  margin-bottom: 0;
}

.workflow-range-hint {
  margin-bottom: 12px;
}

.workflow-params-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.workflow-param-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workflow-param-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.workflow-param-meta {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}

.workflow-param-description {
  font-size: 12px;
  color: var(--text-secondary);
}

.workflow-param-input {
  min-height: 44px;
  margin-bottom: 0;
}

.workflow-param-textarea {
  min-height: 120px;
  margin-bottom: 0;
}

.workflow-param-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
}

.saved-actions {
  margin-top: 12px;
}

.danger-text {
  color: var(--danger);
}

.empty-state {
  padding: 24px 18px;
  border-radius: 18px;
  text-align: center;
  background: rgba(255, 255, 255, 0.62);
  border: 1px dashed rgba(148, 163, 184, 0.4);
}

.empty-state p {
  margin: 0 0 6px;
  font-weight: 700;
}
</style>
