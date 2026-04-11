import type { InputSchema, SiteConfig, SiteTool } from './site-tools-config';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';

const ACTIVE_RECORDING_KEY = 'webmcpActiveRecordingSession';
const LOCAL_RECORDED_TOOLS_KEY = 'webmcpLocalRecordedTools';
const RECORDER_GLOBAL_KEY = '__MCP_CHROME_WEBMCP_RECORDER__';
const MAX_RECORDED_ACTIONS = 200;

type RecordedActionType = 'click' | 'input' | 'change' | 'submit';
type RecordedFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'contenteditable'
  | 'submit'
  | 'button'
  | 'link'
  | 'unknown';

interface RecordedAction {
  type: RecordedActionType;
  selector: string;
  url: string;
  timestamp: number;
  label?: string;
  value?: string | boolean;
  fieldType?: RecordedFieldType;
  paramName?: string;
  cssSelector?: string;
  xpath?: string;
  targetText?: string;
  ariaLabel?: string;
  placeholder?: string;
  nameAttr?: string;
  idAttr?: string;
  dataTestId?: string;
  dataTest?: string;
  elementTag?: string;
  inputType?: string;
}

interface RecordingSession {
  sessionId: string;
  tabId: number;
  toolName: string;
  description: string;
  siteName: string;
  hostname: string;
  startUrl: string;
  startedAt: number;
  actions: RecordedAction[];
  baseToolId?: string;
}

interface RecordedWorkflowStep {
  id: string;
  type: 'navigate' | RecordedActionType;
  description: string;
  url: string;
  timestamp: number;
  fieldType?: RecordedFieldType;
  paramName?: string;
  value?: string | boolean;
  target?: {
    label?: string;
    text?: string;
    cssSelector?: string;
    xpath?: string;
    ariaLabel?: string;
    placeholder?: string;
    nameAttr?: string;
    idAttr?: string;
    dataTestId?: string;
    dataTest?: string;
    elementTag?: string;
    inputType?: string;
  };
  verification?: {
    type: 'value_equals' | 'element_present';
    expected?: string | boolean;
  };
}

interface RecordedWorkflowDocument {
  kind: 'recorded_workflow';
  version: '1.0';
  name: string;
  description: string;
  siteName: string;
  hostname: string;
  startUrl: string;
  createdAt: number;
  updatedAt: number;
  input_schema: Array<{
    name: string;
    type: 'string' | 'boolean';
    required: boolean;
    description?: string;
    default?: string | boolean;
  }>;
  parameterization: {
    stage: 'raw' | 'parameterized';
    mode: 'none' | 'heuristic' | 'llm';
    updatedAt: number;
  };
  steps: RecordedWorkflowStep[];
}

interface StoredRecordedTool {
  id: string;
  name: string;
  description: string;
  siteName: string;
  hostname: string;
  startUrl: string;
  createdAt: number;
  updatedAt: number;
  actions: RecordedAction[];
  rawWorkflow: RecordedWorkflowDocument;
  workflow: RecordedWorkflowDocument;
  tool: SiteTool;
}

interface RecorderState {
  isRecording: boolean;
  tabId: number | null;
  toolName: string;
  description: string;
  url: string | null;
  actionCount: number;
  startedAt: number | null;
}

interface PublicRecordingSession extends RecorderState {
  sessionId: string;
  hostname: string;
  actions: RecordedAction[];
}

interface RecorderEnvironmentInfo {
  popupHasChromeSidePanel: boolean;
  popupHasBrowserSidePanel: boolean;
  backgroundHasChromeSidePanel: boolean;
  backgroundHasBrowserSidePanel: boolean;
  canUseSidePanel: boolean;
  userAgent: string;
}

interface RecorderEventMessage {
  type: 'webmcp:recording-event';
  sessionId: string;
  action: RecordedAction;
}

interface WorkflowReplayStepResult {
  index: number;
  stepId: string;
  type: RecordedWorkflowStep['type'];
  description: string;
  tabId: number;
  url?: string;
  success: boolean;
  locatorStrategy?: string;
  expectedValue?: string | boolean;
  observedValue?: string | boolean | null;
  followedChildTab?: boolean;
  error?: string;
}

interface ParsedReplaySelection {
  normalized: string;
  indexes: number[];
}

type SidePanelApi = {
  open(options: { tabId?: number; windowId?: number }): Promise<void>;
  setOptions(options: { tabId?: number; path?: string; enabled: boolean }): Promise<void>;
  setPanelBehavior?(options: { openPanelOnActionClick: boolean }): Promise<void>;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function dedupeTools(tools: SiteTool[]): SiteTool[] {
  const seen = new Set<string>();
  return tools.filter((tool) => {
    if (seen.has(tool.name)) {
      return false;
    }
    seen.add(tool.name);
    return true;
  });
}

function deriveSiteName(hostname: string): string {
  return slugify(hostname.replace(/^www\./, '')) || 'recorded_site';
}

function defaultToolName(hostname: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return `${deriveSiteName(hostname)}_workflow_${stamp}`;
}

function isSupportedUrl(url?: string | null): url is string {
  return Boolean(url && /^https?:\/\//.test(url));
}

async function readStorage<T>(key: string, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get([key]);
  return (result[key] as T | undefined) ?? fallback;
}

async function writeStorage<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

async function getActiveSession(): Promise<RecordingSession | null> {
  return readStorage<RecordingSession | null>(ACTIVE_RECORDING_KEY, null);
}

async function saveActiveSession(session: RecordingSession | null): Promise<void> {
  if (session) {
    await writeStorage(ACTIVE_RECORDING_KEY, session);
  } else {
    await chrome.storage.local.remove([ACTIVE_RECORDING_KEY]);
  }
}

async function getStoredRecordedTools(): Promise<StoredRecordedTool[]> {
  const rawTools = await readStorage<
    Array<StoredRecordedTool | (Partial<StoredRecordedTool> & { id: string })>
  >(LOCAL_RECORDED_TOOLS_KEY, []);

  let hasMigrated = false;
  const normalizedTools = rawTools.map((rawTool) => {
    if (rawTool.workflow && rawTool.rawWorkflow) {
      return rawTool as StoredRecordedTool;
    }

    const actions = assignActionParamNames(sanitizeActions(rawTool.actions || []));
    const rebuilt = buildRecordedTool({
      sessionId: rawTool.id,
      tabId: 0,
      toolName: rawTool.name || defaultToolName(rawTool.hostname || 'recorded.site'),
      description: rawTool.description || `Recorded workflow for ${rawTool.hostname || 'site'}`,
      siteName: rawTool.siteName || deriveSiteName(rawTool.hostname || 'recorded.site'),
      hostname: rawTool.hostname || 'recorded.site',
      startUrl: rawTool.startUrl || 'https://example.com',
      startedAt: rawTool.createdAt || rawTool.updatedAt || Date.now(),
      actions,
    });

    hasMigrated = true;
    return {
      ...rebuilt,
      id: rawTool.id || rebuilt.id,
      createdAt: rawTool.createdAt || rebuilt.createdAt,
      updatedAt: rawTool.updatedAt || rebuilt.updatedAt,
      rawWorkflow: rawTool.rawWorkflow || rebuilt.rawWorkflow,
      workflow: rawTool.workflow || rebuilt.workflow,
    };
  });

  if (hasMigrated) {
    await saveStoredRecordedTools(normalizedTools);
  }

  return normalizedTools;
}

async function saveStoredRecordedTools(tools: StoredRecordedTool[]): Promise<void> {
  await writeStorage(LOCAL_RECORDED_TOOLS_KEY, tools);
}

function extractParamNameFromPlaceholder(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^\{([^{}]+)\}$/);
  if (!match?.[1]) return null;
  return match[1].trim() || null;
}

function buildUrlPattern(url: string): RegExp {
  const { origin } = new URL(url);
  return new RegExp(`^${escapeRegExp(origin)}(?:/.*)?$`);
}

function normalizeParamName(name: string, fallbackPrefix: string, index: number): string {
  const normalized = slugify(name);
  if (!normalized) {
    return `${fallbackPrefix}_${index + 1}`;
  }
  return /^[a-z_]/.test(normalized) ? normalized : `${fallbackPrefix}_${normalized}`;
}

function normalizeSemanticSource(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function looksGenericParamName(value?: string): boolean {
  if (!value) return true;
  return /^(field|input|value|param|text|textarea)(?:_\d+)?$/i.test(value.trim());
}

function uniqueParamName(candidate: string, usedNames: Set<string>, index: number): string {
  const normalized = normalizeParamName(candidate, 'field', index);
  let unique = normalized;
  let suffix = 2;
  while (usedNames.has(unique)) {
    unique = `${normalized}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(unique);
  return unique;
}

function inferSemanticParamBaseName(action: RecordedAction, index: number): string {
  const rawSources = [
    action.label,
    action.targetText,
    action.ariaLabel,
    action.placeholder,
    action.nameAttr,
    action.idAttr,
    action.paramName,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const semanticSources = rawSources.map(normalizeSemanticSource);

  const semanticRules: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /(^|[\s_])(title|headline|subject)([\s_]|$)|标题|题目/u, name: 'title' },
    {
      pattern:
        /(^|[\s_])(body|content|article|message|description|editor)([\s_]|$)|正文|内容|文章|描述/u,
      name: 'body',
    },
    { pattern: /(^|[\s_])(summary|excerpt|abstract)([\s_]|$)|摘要|简介/u, name: 'summary' },
    { pattern: /(^|[\s_])(tag|label)([\s_]|$)|标签/u, name: 'tag' },
    { pattern: /(^|[\s_])(category|group|folder)([\s_]|$)|分类|分组/u, name: 'category' },
    { pattern: /(^|[\s_])(query|search|keyword)([\s_]|$)|搜索|关键词/u, name: 'query' },
    { pattern: /(^|[\s_])(url|link|href)([\s_]|$)|链接|网址/u, name: 'url' },
    { pattern: /(^|[\s_])(email|mail)([\s_]|$)|邮箱|邮件/u, name: 'email' },
    { pattern: /(^|[\s_])(phone|mobile|tel)([\s_]|$)|手机号|电话|手机/u, name: 'phone' },
    {
      pattern: /(^|[\s_])(user|username|account|login)([\s_]|$)|用户名|账号|账户/u,
      name: 'username',
    },
    { pattern: /(^|[\s_])(password|passwd|pwd)([\s_]|$)|密码/u, name: 'password' },
    {
      pattern: /(^|[\s_])(image|cover|thumbnail|poster)([\s_]|$)|图片|封面|缩略图/u,
      name: 'image',
    },
    { pattern: /(^|[\s_])(file|upload|attachment)([\s_]|$)|文件|上传|附件/u, name: 'file' },
    { pattern: /(^|[\s_])(date|time|datetime)([\s_]|$)|日期|时间/u, name: 'scheduled_at' },
    { pattern: /(^|[\s_])(price|amount|cost)([\s_]|$)|价格|金额/u, name: 'amount' },
    { pattern: /(^|[\s_])(name|full name)([\s_]|$)|姓名|名称/u, name: 'name' },
  ];

  for (const source of semanticSources) {
    for (const rule of semanticRules) {
      if (rule.pattern.test(source)) {
        if (rule.name === 'body' && action.fieldType === 'contenteditable') {
          return 'body';
        }
        return rule.name;
      }
    }
  }

  const attributeCandidates = [action.nameAttr, action.idAttr]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) =>
      normalizeSemanticSource(value)
        .replace(/\b(input|textarea|editor|field|value|form|txt|text|box)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);

  for (const candidate of attributeCandidates) {
    const normalized = slugify(candidate);
    if (normalized && !looksGenericParamName(normalized)) {
      return normalized;
    }
  }

  if (
    typeof action.paramName === 'string' &&
    action.paramName.trim() &&
    !looksGenericParamName(action.paramName)
  ) {
    return action.paramName;
  }

  if (action.fieldType === 'contenteditable' || action.fieldType === 'textarea') {
    return 'body';
  }

  return `field_${index + 1}`;
}

function getActionIdentity(action: RecordedAction): string {
  return [action.type, getActionLocatorIdentity(action)].filter(Boolean).join('|');
}

function getActionLocatorIdentity(action: RecordedAction): string {
  return [
    action.idAttr ? `id:${action.idAttr}` : '',
    action.nameAttr ? `name:${action.nameAttr}` : '',
    action.dataTestId ? `data-testid:${action.dataTestId}` : '',
    action.dataTest ? `data-test:${action.dataTest}` : '',
    action.ariaLabel ? `aria:${action.ariaLabel}` : '',
    action.placeholder ? `placeholder:${action.placeholder}` : '',
    action.label ? `label:${action.label}` : '',
    action.targetText ? `text:${action.targetText}` : '',
    action.cssSelector ? `css:${action.cssSelector}` : '',
    action.xpath ? `xpath:${action.xpath}` : '',
    action.selector ? `selector:${action.selector}` : '',
  ]
    .filter(Boolean)
    .join('|');
}

function getActionDisplayTarget(action: RecordedAction): string {
  return (
    action.label ||
    action.targetText ||
    action.ariaLabel ||
    action.placeholder ||
    action.nameAttr ||
    action.idAttr ||
    action.cssSelector ||
    action.xpath ||
    action.selector
  );
}

function buildActionDescription(action: RecordedAction): string {
  const target = getActionDisplayTarget(action);
  if (action.type === 'click') {
    return `Click ${target}`;
  }
  if (action.type === 'submit') {
    return `Submit ${target}`;
  }
  if (action.type === 'change') {
    return `Change ${target}`;
  }
  return `Fill ${target}`;
}

function buildWorkflowInputSchema(
  actions: RecordedAction[],
): RecordedWorkflowDocument['input_schema'] {
  const seen = new Set<string>();
  const inputs: RecordedWorkflowDocument['input_schema'] = [];

  actions.forEach((action, index) => {
    if (!['input', 'change'].includes(action.type)) return;
    if (!action.paramName || seen.has(action.paramName)) return;

    inputs.push({
      name: action.paramName,
      type: action.fieldType === 'checkbox' ? 'boolean' : 'string',
      required: true,
      description: action.label || action.targetText || `Recorded field ${index + 1}`,
      default: action.value,
    });
    seen.add(action.paramName);
  });

  return inputs;
}

function buildWorkflowStepFromAction(
  action: RecordedAction,
  index: number,
  options: {
    parameterizeValues: boolean;
  },
): RecordedWorkflowStep {
  const shouldParameterizeValue =
    options.parameterizeValues &&
    (action.type === 'input' || action.type === 'change') &&
    action.paramName;

  return {
    id: `step_${index + 2}`,
    type: action.type,
    description: buildActionDescription(action),
    url: action.url,
    timestamp: action.timestamp,
    fieldType: action.fieldType,
    paramName: action.paramName,
    value: shouldParameterizeValue ? `{${action.paramName}}` : action.value,
    target: {
      label: action.label,
      text: action.targetText,
      cssSelector: action.cssSelector || action.selector,
      xpath: action.xpath,
      ariaLabel: action.ariaLabel,
      placeholder: action.placeholder,
      nameAttr: action.nameAttr,
      idAttr: action.idAttr,
      dataTestId: action.dataTestId,
      dataTest: action.dataTest,
      elementTag: action.elementTag,
      inputType: action.inputType,
    },
    verification:
      action.type === 'input' || action.type === 'change'
        ? {
            type: 'value_equals',
            expected: shouldParameterizeValue ? `{${action.paramName}}` : action.value,
          }
        : {
            type: 'element_present',
          },
  };
}

function buildRecordedWorkflowDocument(
  session: RecordingSession,
  actions: RecordedAction[],
  options: {
    stage: 'raw' | 'parameterized';
    parameterizeValues: boolean;
    mode: 'none' | 'heuristic' | 'llm';
  },
): RecordedWorkflowDocument {
  return {
    kind: 'recorded_workflow',
    version: '1.0',
    name: slugify(session.toolName) || defaultToolName(session.hostname),
    description: session.description || `Recorded workflow for ${session.hostname}`,
    siteName: session.siteName,
    hostname: session.hostname,
    startUrl: session.startUrl,
    createdAt: session.startedAt,
    updatedAt: Date.now(),
    input_schema: options.parameterizeValues ? buildWorkflowInputSchema(actions) : [],
    parameterization: {
      stage: options.stage,
      mode: options.mode,
      updatedAt: Date.now(),
    },
    steps: [
      {
        id: 'step_1',
        type: 'navigate',
        description: `Navigate to ${session.startUrl}`,
        url: session.startUrl,
        timestamp: session.startedAt,
      },
      ...actions.map((action, index) =>
        buildWorkflowStepFromAction(action, index, {
          parameterizeValues: options.parameterizeValues,
        }),
      ),
    ],
  };
}

function assignActionParamNames(actions: RecordedAction[]): RecordedAction[] {
  const usedParamNames = new Set<string>();
  const paramNameByLocator = new Map<string, string>();

  return actions.map((action, index) => {
    if (!['input', 'change'].includes(action.type)) {
      return action;
    }

    const locatorKey = getActionLocatorIdentity(action);
    const existingName = paramNameByLocator.get(locatorKey);
    if (existingName) {
      return {
        ...action,
        paramName: existingName,
      };
    }

    const baseName = normalizeParamName(
      action.paramName || action.label || action.targetText || 'field',
      'field',
      index,
    );
    let uniqueName = baseName;
    let suffix = 2;
    while (usedParamNames.has(uniqueName)) {
      uniqueName = `${baseName}_${suffix}`;
      suffix += 1;
    }
    usedParamNames.add(uniqueName);
    paramNameByLocator.set(locatorKey, uniqueName);
    return {
      ...action,
      paramName: uniqueName,
    };
  });
}

function sanitizeActions(actions: RecordedAction[]): RecordedAction[] {
  const normalized: RecordedAction[] = [];

  for (const action of actions) {
    const last = normalized[normalized.length - 1];
    const actionIdentity = getActionIdentity(action);
    const lastIdentity = last ? getActionIdentity(last) : '';
    const isDuplicate =
      last &&
      last.type === action.type &&
      lastIdentity === actionIdentity &&
      last.value === action.value &&
      action.timestamp - last.timestamp < 300;

    if (isDuplicate) {
      normalized[normalized.length - 1] = action;
      continue;
    }

    if (
      action.type === 'input' &&
      last &&
      last.type === 'input' &&
      lastIdentity === actionIdentity
    ) {
      normalized[normalized.length - 1] = action;
      continue;
    }

    normalized.push(action);
  }

  return normalized.slice(0, MAX_RECORDED_ACTIONS);
}

function buildInputSchema(actions: RecordedAction[]): InputSchema {
  const properties: InputSchema['properties'] = {};
  const required: string[] = [];
  const seen = new Set<string>();

  actions.forEach((action, index) => {
    if (!['input', 'change'].includes(action.type)) return;
    if (!action.paramName) return;
    if (seen.has(action.paramName)) return;

    const type = action.fieldType === 'checkbox' ? 'boolean' : 'string';
    properties[action.paramName] = {
      type,
      description: action.label || action.targetText || `Recorded field ${index + 1}`,
    };
    required.push(action.paramName);
    seen.add(action.paramName);
  });

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

function buildToolInputSchema(
  actions: RecordedAction[],
  workflow?: RecordedWorkflowDocument,
): InputSchema {
  if (!workflow?.input_schema?.length) {
    return buildInputSchema(actions);
  }

  const properties: InputSchema['properties'] = {};
  const required: string[] = [];

  workflow.input_schema.forEach((field) => {
    if (!field?.name) return;
    properties[field.name] = {
      type: field.type,
      description: field.description,
    };
    if (field.required) {
      required.push(field.name);
    }
  });

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

function buildSiteTool(actions: RecordedAction[], workflow: RecordedWorkflowDocument): SiteTool {
  return {
    name: workflow.name,
    description: workflow.description,
    inputSchema: buildToolInputSchema(actions, workflow),
    handler: buildHandler(actions),
  };
}

function buildWorkflowParamsWithDefaults(
  workflow: RecordedWorkflowDocument,
  params?: Record<string, unknown>,
): Record<string, unknown> {
  const nextParams: Record<string, unknown> = {};

  workflow.input_schema.forEach((field) => {
    if (field?.name && field.default !== undefined) {
      nextParams[field.name] = field.default;
    }
  });

  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      nextParams[key] = value;
    });
  }

  return nextParams;
}

function resolveWorkflowStepValue(
  rawValue: string | boolean | undefined,
  params: Record<string, unknown>,
): string | boolean | undefined {
  if (typeof rawValue !== 'string') {
    return rawValue;
  }

  const paramName = extractParamNameFromPlaceholder(rawValue);
  if (!paramName) {
    return rawValue;
  }

  if (Object.prototype.hasOwnProperty.call(params, paramName)) {
    const resolved = params[paramName];
    if (typeof resolved === 'string' || typeof resolved === 'boolean') {
      return resolved;
    }
    if (resolved == null) {
      return '';
    }
    return String(resolved);
  }

  return rawValue;
}

function isWorkflowNavigateStep(step: RecordedWorkflowStep): boolean {
  return step.type === 'navigate';
}

function parseReplayStepSelection(
  rawValue: string | undefined,
  totalSteps: number,
): ParsedReplaySelection {
  const input = (rawValue || '').trim();
  if (!input) {
    return {
      normalized: '',
      indexes: Array.from({ length: totalSteps }, (_, index) => index),
    };
  }

  const selected = new Set<number>();
  const segments = input
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error('Replay step range is empty.');
  }

  for (const segment of segments) {
    const rangeMatch = segment.match(/^(\d+)?-(\d+)?$/);
    if (rangeMatch) {
      const rawStart = rangeMatch[1];
      const rawEnd = rangeMatch[2];
      const start = rawStart ? Number(rawStart) : 1;
      const end = rawEnd ? Number(rawEnd) : totalSteps;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1) {
        throw new Error(`Invalid replay step range: ${segment}`);
      }
      if (start > end) {
        throw new Error(`Replay step range start must be <= end: ${segment}`);
      }
      for (let current = start; current <= Math.min(end, totalSteps); current += 1) {
        selected.add(current - 1);
      }
      continue;
    }

    if (!/^\d+$/.test(segment)) {
      throw new Error(`Invalid replay step selector: ${segment}`);
    }

    const stepNumber = Number(segment);
    if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > totalSteps) {
      throw new Error(`Replay step number out of range: ${segment}`);
    }
    selected.add(stepNumber - 1);
  }

  return {
    normalized: input,
    indexes: Array.from(selected).sort((left, right) => left - right),
  };
}

function getCurrentWindowActiveTab(): Promise<chrome.tabs.Tab | null> {
  return chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => tab ?? null);
}

function waitForTabComplete(tabId: number, timeout = 15000): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
    };

    const finish = async () => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        const tab = await chrome.tabs.get(tabId);
        resolve(tab);
      } catch (error) {
        reject(error);
      }
    };

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        void finish();
      }
    };

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Page load timeout.'));
    }, timeout);

    chrome.tabs.onUpdated.addListener(listener);

    void chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === 'complete') {
          return finish();
        }
      })
      .catch(reject);
  });
}

async function detectReplayTargetTab(
  sourceTabId: number,
  windowId: number,
  sourceUrl: string,
  timeout = 1200,
): Promise<{
  tab: chrome.tabs.Tab;
  followedChildTab: boolean;
}> {
  const immediateTabs = await chrome.tabs.query({ windowId });
  const immediateChild = immediateTabs.find((tab) => tab.openerTabId === sourceTabId && tab.active);
  if (immediateChild?.id) {
    const childTab =
      immediateChild.status === 'complete'
        ? immediateChild
        : await waitForTabComplete(immediateChild.id).catch(() => immediateChild);
    return { tab: childTab, followedChildTab: true };
  }

  const currentSourceTab = await chrome.tabs.get(sourceTabId);
  if ((currentSourceTab.url || '') !== sourceUrl && currentSourceTab.status === 'complete') {
    return { tab: currentSourceTab, followedChildTab: false };
  }

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      chrome.tabs.onCreated.removeListener(onCreated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };

    const finish = (tab: chrome.tabs.Tab, followedChildTab: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ tab, followedChildTab });
    };

    const onCreated = (tab: chrome.tabs.Tab) => {
      if (tab.openerTabId !== sourceTabId || tab.active !== true || typeof tab.id !== 'number')
        return;
      void waitForTabComplete(tab.id)
        .then((loadedTab) => finish(loadedTab, true))
        .catch(() => finish(tab, true));
    };

    const onUpdated = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (updatedTabId !== sourceTabId || changeInfo.status !== 'complete') return;
      if ((tab.url || sourceUrl) === sourceUrl) return;
      finish(tab, false);
    };

    chrome.tabs.onCreated.addListener(onCreated);
    chrome.tabs.onUpdated.addListener(onUpdated);

    timer = setTimeout(async () => {
      cleanup();
      const latestTab = await chrome.tabs.get(sourceTabId).catch(() => currentSourceTab);
      resolve({ tab: latestTab, followedChildTab: false });
    }, timeout);
  });
}

async function executeWorkflowStepOnTab(
  tabId: number,
  step: RecordedWorkflowStep,
  resolvedValue: string | boolean | undefined,
): Promise<WorkflowReplayStepResult> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (workflowStep: RecordedWorkflowStep, stepValue: string | boolean | undefined) => {
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const normalizeSpace = (input: unknown) =>
        String(input ?? '')
          .replace(/\s+/g, ' ')
          .trim();
      const unique = (items: Array<string | undefined>) =>
        Array.from(new Set(items.map((item) => item?.trim() || '').filter(Boolean)));
      const cssEscape = (value: string) => {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
          return CSS.escape(String(value));
        }
        return String(value).replace(/["\\]/g, '\\$&');
      };
      const safeQueryAll = (selector: string) => {
        try {
          return Array.from(document.querySelectorAll(selector));
        } catch {
          return [];
        }
      };
      const queryXPathAll = (xpath?: string) => {
        if (!xpath) return [];
        try {
          const result = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null,
          );
          const nodes: Element[] = [];
          for (let index = 0; index < result.snapshotLength; index += 1) {
            const item = result.snapshotItem(index);
            if (item instanceof Element) {
              nodes.push(item);
            }
          }
          return nodes;
        } catch {
          return [];
        }
      };
      const locator = workflowStep.target || {};
      const isVisible = (element: Element) => {
        if (!(element instanceof HTMLElement)) return true;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };
      const matchesLocatorShape = (element: Element) => {
        if (
          locator.elementTag &&
          element.tagName.toLowerCase() !== String(locator.elementTag).toLowerCase()
        ) {
          return false;
        }
        if (locator.inputType) {
          if (!(element instanceof HTMLInputElement)) return false;
          return element.type.toLowerCase() === String(locator.inputType).toLowerCase();
        }
        return true;
      };
      const pickElement = (elements: Element[]) => {
        const scoped = elements.filter((element) => matchesLocatorShape(element));
        return scoped.find((element) => isVisible(element)) || scoped[0] || null;
      };
      const buildAttributeSelectors = () => {
        const tag = locator.elementTag ? String(locator.elementTag).toLowerCase() : '';
        const selectors: string[] = [];
        const pushSelector = (selector: string) => {
          if (selector) selectors.push(selector);
        };
        if (locator.idAttr) {
          pushSelector('#' + cssEscape(String(locator.idAttr)));
          if (tag) {
            pushSelector(tag + '#' + cssEscape(String(locator.idAttr)));
          }
        }
        const attributePairs = [
          ['data-testid', locator.dataTestId],
          ['data-test', locator.dataTest],
          ['name', locator.nameAttr],
          ['aria-label', locator.ariaLabel],
          ['placeholder', locator.placeholder],
        ];
        for (const [attribute, rawValue] of attributePairs) {
          if (!rawValue) continue;
          const value = cssEscape(String(rawValue));
          if (tag) {
            pushSelector(tag + '[' + attribute + '="' + value + '"]');
          }
          pushSelector('[' + attribute + '="' + value + '"]');
        }
        return unique(selectors);
      };
      const getElementTextCandidates = (element: Element) => {
        const texts: string[] = [];
        const pushText = (value: unknown) => {
          const normalized = normalizeSpace(value);
          if (normalized) {
            texts.push(normalized);
          }
        };
        if (element instanceof HTMLInputElement) {
          pushText(element.value);
          pushText(element.labels?.[0]?.textContent);
        }
        if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
          pushText(element.value);
          pushText(element.labels?.[0]?.textContent);
        }
        pushText(element.getAttribute('aria-label'));
        pushText(element.textContent);
        return unique(texts);
      };
      const findByAssociatedLabel = () => {
        const texts = unique([
          locator.label as string | undefined,
          locator.text as string | undefined,
          locator.ariaLabel as string | undefined,
          locator.placeholder as string | undefined,
        ]);
        for (const text of texts) {
          const desired = normalizeSpace(text);
          if (!desired) continue;
          const labels = Array.from(document.querySelectorAll('label'));
          for (const label of labels) {
            if (normalizeSpace(label.textContent) !== desired) continue;
            const control =
              label.control ||
              label.querySelector('input, textarea, select, [contenteditable="true"]');
            if (control instanceof Element && matchesLocatorShape(control)) {
              return control;
            }
          }
        }
        return null;
      };
      const findByText = () => {
        const texts = unique([
          locator.text as string | undefined,
          locator.label as string | undefined,
          locator.ariaLabel as string | undefined,
        ]);
        const selectorParts = unique([
          locator.elementTag ? String(locator.elementTag).toLowerCase() : '',
          'button',
          'a',
          'label',
          '[role="button"]',
          '[role="menuitem"]',
          '[role="tab"]',
          'input[type="button"]',
          'input[type="submit"]',
          'input[type="reset"]',
        ]);
        if (selectorParts.length === 0) return null;
        const candidates = safeQueryAll(selectorParts.join(', ')).filter((element) =>
          matchesLocatorShape(element),
        );
        for (const text of texts) {
          const desired = normalizeSpace(text);
          if (!desired) continue;
          const exact = candidates.filter((element) =>
            getElementTextCandidates(element).some((candidate) => candidate === desired),
          );
          const partial = candidates.filter((element) =>
            getElementTextCandidates(element).some(
              (candidate) => candidate.includes(desired) || desired.includes(candidate),
            ),
          );
          const match = pickElement(exact) || pickElement(partial);
          if (match) {
            return match;
          }
        }
        return null;
      };
      const describeLocator = () =>
        unique([
          locator.label as string | undefined,
          locator.text as string | undefined,
          locator.ariaLabel as string | undefined,
          locator.placeholder as string | undefined,
          locator.nameAttr as string | undefined,
          locator.idAttr as string | undefined,
          locator.cssSelector as string | undefined,
          locator.xpath as string | undefined,
        ])[0] ||
        workflowStep.description ||
        'recorded target';
      const locateElement = (strategies: string[]) => {
        for (const strategy of strategies) {
          if (strategy === 'label') {
            const element = findByAssociatedLabel();
            if (element) return { element, strategy };
          }
          if (strategy === 'text') {
            const element = findByText();
            if (element) return { element, strategy };
          }
          if (strategy === 'attrs') {
            for (const selector of buildAttributeSelectors()) {
              const element = pickElement(safeQueryAll(selector));
              if (element) return { element, strategy: 'attrs:' + selector };
            }
          }
          if (strategy === 'css') {
            const selector = (locator.cssSelector || workflowStep.target?.cssSelector) as
              | string
              | undefined;
            if (selector) {
              const element = pickElement(safeQueryAll(selector));
              if (element) return { element, strategy: 'css' };
            }
          }
          if (strategy === 'xpath') {
            const selector = (locator.xpath || workflowStep.target?.xpath) as string | undefined;
            if (selector) {
              const element = pickElement(queryXPathAll(selector));
              if (element) return { element, strategy: 'xpath' };
            }
          }
        }
        return null;
      };
      const waitForElement = async (strategies: string[], timeout = 5000) => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeout) {
          const located = locateElement(strategies);
          if (located) return located;
          await sleep(100);
        }
        throw new Error('Element not found for step: ' + describeLocator());
      };
      const readValue = (element: Element, fieldType: string) => {
        if (fieldType === 'checkbox' && element instanceof HTMLInputElement) {
          return element.checked;
        }
        if (fieldType === 'contenteditable' && element instanceof HTMLElement) {
          return normalizeSpace(element.textContent);
        }
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
        ) {
          return element.value;
        }
        return normalizeSpace(element.textContent);
      };
      const isValueVerified = (actualValue: unknown, expectedValue: unknown, fieldType: string) => {
        if (expectedValue === undefined) return true;
        if (fieldType === 'checkbox') {
          return Boolean(actualValue) === Boolean(expectedValue);
        }
        return String(actualValue ?? '') === String(expectedValue ?? '');
      };
      const setValue = async (
        element: Element,
        value: string | boolean | undefined,
        fieldType: string,
      ) => {
        if (fieldType === 'checkbox') {
          if (!(element instanceof HTMLInputElement)) {
            throw new Error('Expected checkbox input but got ' + element.tagName);
          }
          element.checked = Boolean(value);
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        if (fieldType === 'contenteditable') {
          if (!(element instanceof HTMLElement)) {
            throw new Error('Expected contenteditable element but got ' + element.tagName);
          }
          element.focus();
          element.textContent = String(value ?? '');
          element.dispatchEvent(
            new InputEvent('input', { bubbles: true, data: String(value ?? '') }),
          );
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        if (element instanceof HTMLSelectElement) {
          element.focus();
          element.value = String(value ?? '');
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          element.focus();
          element.value = String(value ?? '');
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        throw new Error('Unsupported field element: ' + element.tagName);
      };

      const preferredStrategies =
        workflowStep.type === 'click' || workflowStep.type === 'submit'
          ? ['label', 'text', 'attrs', 'css', 'xpath']
          : ['label', 'attrs', 'css', 'xpath', 'text'];

      const located = await waitForElement(preferredStrategies);

      if (workflowStep.type === 'click') {
        (located.element as HTMLElement).click();
        await sleep(150);
        return {
          success: true,
          locatorStrategy: located.strategy,
          target: describeLocator(),
        };
      }

      if (workflowStep.type === 'submit') {
        const form =
          located.element instanceof HTMLFormElement
            ? located.element
            : located.element.closest('form');
        if (!(form instanceof HTMLFormElement)) {
          throw new Error('Expected form for step: ' + describeLocator());
        }
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.submit();
        }
        await sleep(150);
        return {
          success: true,
          locatorStrategy: located.strategy,
          target: describeLocator(),
        };
      }

      const fieldType = workflowStep.fieldType || 'text';
      await setValue(located.element, stepValue, fieldType);
      const observedValue = readValue(located.element, fieldType);
      const success = isValueVerified(observedValue, stepValue, fieldType);
      return {
        success,
        locatorStrategy: located.strategy,
        target: describeLocator(),
        expectedValue: stepValue,
        observedValue,
      };
    },
    args: [step, resolvedValue],
  });

  const stepResult = result as {
    success: boolean;
    locatorStrategy?: string;
    expectedValue?: string | boolean;
    observedValue?: string | boolean | null;
    error?: string;
  };

  return {
    index: 0,
    stepId: step.id,
    type: step.type,
    description: step.description,
    tabId,
    success: stepResult?.success ?? false,
    locatorStrategy: stepResult?.locatorStrategy,
    expectedValue: stepResult?.expectedValue,
    observedValue: stepResult?.observedValue,
    error: stepResult?.error,
  };
}

function buildWorkflowSessionSeed(
  tool: Pick<
    StoredRecordedTool,
    'id' | 'name' | 'description' | 'siteName' | 'hostname' | 'startUrl' | 'createdAt'
  >,
  name?: string,
  description?: string,
): RecordingSession {
  return {
    sessionId: tool.id,
    tabId: 0,
    toolName: name || tool.name,
    description: description || tool.description,
    siteName: tool.siteName,
    hostname: tool.hostname,
    startUrl: tool.startUrl,
    startedAt: tool.createdAt,
    actions: [],
  };
}

function updateActionsFromWorkflow(
  actions: RecordedAction[],
  workflow: RecordedWorkflowDocument,
): RecordedAction[] {
  const actionSteps = Array.isArray(workflow.steps)
    ? workflow.steps.filter((step) => step.type !== 'navigate')
    : [];
  const paramNameByLocator = new Map<string, string>();
  const seenFallbackNames = new Set<string>();

  return actions.map((action, index) => {
    if (!['input', 'change'].includes(action.type)) {
      return action;
    }

    const locatorKey = getActionLocatorIdentity(action);
    const step = actionSteps[index];
    const explicitParamName =
      (typeof step?.paramName === 'string' && step.paramName.trim()) ||
      extractParamNameFromPlaceholder(step?.value) ||
      extractParamNameFromPlaceholder(step?.verification?.expected);

    if (explicitParamName) {
      const normalizedExplicit = normalizeParamName(explicitParamName, 'field', index);
      seenFallbackNames.add(normalizedExplicit);
      paramNameByLocator.set(locatorKey, normalizedExplicit);
      return {
        ...action,
        paramName: normalizedExplicit,
      };
    }

    const existingForLocator = paramNameByLocator.get(locatorKey);
    if (existingForLocator) {
      return {
        ...action,
        paramName: existingForLocator,
      };
    }

    const baseName = normalizeParamName(
      action.paramName || action.label || action.targetText || 'field',
      'field',
      index,
    );
    let uniqueName = baseName;
    let suffix = 2;
    while (seenFallbackNames.has(uniqueName)) {
      uniqueName = `${baseName}_${suffix}`;
      suffix += 1;
    }
    seenFallbackNames.add(uniqueName);
    paramNameByLocator.set(locatorKey, uniqueName);
    return {
      ...action,
      paramName: uniqueName,
    };
  });
}

function normalizeWorkflowInputSchema(
  actions: RecordedAction[],
  workflow: RecordedWorkflowDocument,
): RecordedWorkflowDocument['input_schema'] {
  const fallback = buildWorkflowInputSchema(actions);
  if (!Array.isArray(workflow.input_schema) || workflow.input_schema.length === 0) {
    return fallback;
  }

  const overrides = new Map(
    workflow.input_schema
      .filter((field) => field && typeof field.name === 'string' && field.name.trim())
      .map((field) => [field.name, field] as const),
  );

  return fallback.map((field) => ({
    ...field,
    ...(overrides.get(field.name) || {}),
    name: field.name,
  }));
}

function normalizeWorkflowDocument(
  storedTool: StoredRecordedTool,
  workflow: RecordedWorkflowDocument,
  actions: RecordedAction[],
): RecordedWorkflowDocument {
  const mode = workflow.parameterization?.mode === 'llm' ? 'llm' : 'heuristic';
  const fallback = buildRecordedWorkflowDocument(
    buildWorkflowSessionSeed(
      storedTool,
      workflow.name || storedTool.name,
      workflow.description || storedTool.description,
    ),
    actions,
    {
      stage: 'parameterized',
      parameterizeValues: true,
      mode,
    },
  );

  const suppliedSteps = Array.isArray(workflow.steps)
    ? workflow.steps.filter((step) => step && step.type !== 'navigate')
    : [];

  const normalizedActionSteps = actions.map((action, index) => {
    const fallbackStep = fallback.steps[index + 1];
    const suppliedStep = suppliedSteps[index];
    const explicitParamName =
      (typeof suppliedStep?.paramName === 'string' && suppliedStep.paramName.trim()) ||
      extractParamNameFromPlaceholder(suppliedStep?.value) ||
      extractParamNameFromPlaceholder(suppliedStep?.verification?.expected);

    return {
      ...fallbackStep,
      ...(suppliedStep || {}),
      id: suppliedStep?.id || fallbackStep.id,
      type: fallbackStep.type,
      url: suppliedStep?.url || fallbackStep.url,
      timestamp:
        typeof suppliedStep?.timestamp === 'number'
          ? suppliedStep.timestamp
          : fallbackStep.timestamp,
      paramName: explicitParamName || fallbackStep.paramName,
      target: {
        ...(fallbackStep.target || {}),
        ...(suppliedStep?.target || {}),
      },
      verification: suppliedStep?.verification || fallbackStep.verification,
    };
  });

  const normalizedName =
    slugify(String(workflow.name || fallback.name || storedTool.name)) || fallback.name;
  const normalizedDescription =
    typeof workflow.description === 'string' && workflow.description.trim()
      ? workflow.description.trim()
      : fallback.description;

  return {
    ...fallback,
    ...workflow,
    kind: 'recorded_workflow',
    version: '1.0',
    name: normalizedName,
    description: normalizedDescription,
    siteName: storedTool.siteName,
    hostname: storedTool.hostname,
    startUrl: storedTool.startUrl,
    createdAt: storedTool.createdAt,
    updatedAt: Date.now(),
    input_schema: normalizeWorkflowInputSchema(actions, workflow),
    parameterization: {
      stage: 'parameterized',
      mode,
      updatedAt: Date.now(),
    },
    steps: [fallback.steps[0], ...normalizedActionSteps],
  };
}

function updateStoredToolWorkflow(
  storedTool: StoredRecordedTool,
  workflow: RecordedWorkflowDocument,
): StoredRecordedTool {
  const updatedActions = updateActionsFromWorkflow(storedTool.actions, workflow);
  const normalizedWorkflow = normalizeWorkflowDocument(storedTool, workflow, updatedActions);
  const tool = buildSiteTool(updatedActions, normalizedWorkflow);

  return {
    ...storedTool,
    id: `${storedTool.hostname}:${tool.name}`,
    name: tool.name,
    description: tool.description,
    updatedAt: normalizedWorkflow.updatedAt,
    actions: updatedActions,
    workflow: normalizedWorkflow,
    tool,
  };
}

function buildHeuristicRefinedActions(storedTool: StoredRecordedTool): RecordedAction[] {
  const usedNames = new Set<string>();
  const nameByLocator = new Map<string, string>();

  return storedTool.actions.map((action, index) => {
    if (!['input', 'change'].includes(action.type)) {
      return action;
    }

    const locatorKey = getActionLocatorIdentity(action);
    const existingName = nameByLocator.get(locatorKey);
    if (existingName) {
      return {
        ...action,
        paramName: existingName,
      };
    }

    const inferredName = uniqueParamName(
      inferSemanticParamBaseName(action, index),
      usedNames,
      index,
    );
    nameByLocator.set(locatorKey, inferredName);

    return {
      ...action,
      paramName: inferredName,
    };
  });
}

function buildHeuristicRefinedWorkflow(storedTool: StoredRecordedTool): RecordedWorkflowDocument {
  const refinedActions = buildHeuristicRefinedActions(storedTool);
  const sessionSeed = buildWorkflowSessionSeed(storedTool, storedTool.name, storedTool.description);

  return buildRecordedWorkflowDocument(sessionSeed, refinedActions, {
    stage: 'parameterized',
    parameterizeValues: true,
    mode: 'heuristic',
  });
}

async function persistUpdatedWorkflow(
  id: string,
  workflow: RecordedWorkflowDocument,
): Promise<StoredRecordedTool> {
  const tools = await getStoredRecordedTools();
  const toolIndex = tools.findIndex((tool) => tool.id === id);
  if (toolIndex < 0) {
    throw new Error('Recorded workflow not found.');
  }

  const updatedTool = updateStoredToolWorkflow(tools[toolIndex], workflow);
  const duplicateIndex = tools.findIndex(
    (tool, index) => index !== toolIndex && tool.id === updatedTool.id,
  );
  if (duplicateIndex >= 0) {
    throw new Error('A recorded workflow with the same name already exists for this site.');
  }

  tools[toolIndex] = updatedTool;
  await saveStoredRecordedTools(tools);
  return updatedTool;
}

async function refineStoredWorkflowParameters(id: string): Promise<StoredRecordedTool> {
  const tools = await getStoredRecordedTools();
  const storedTool = tools.find((tool) => tool.id === id);
  if (!storedTool) {
    throw new Error('Recorded workflow not found.');
  }

  const refinedWorkflow = buildHeuristicRefinedWorkflow(storedTool);
  return persistUpdatedWorkflow(id, refinedWorkflow);
}

async function replayStoredWorkflow(
  id: string,
  params?: Record<string, unknown>,
  stepSelection?: string,
): Promise<{
  success: boolean;
  toolId: string;
  toolName: string;
  activeTabId: number;
  steps: WorkflowReplayStepResult[];
  params: Record<string, unknown>;
  selectedSteps: number[];
  stepSelection: string;
  error?: string;
}> {
  const tools = await getStoredRecordedTools();
  const storedTool = tools.find((tool) => tool.id === id);
  if (!storedTool) {
    throw new Error('Recorded workflow not found.');
  }

  const workflow = storedTool.workflow || storedTool.rawWorkflow;
  const resolvedParams = buildWorkflowParamsWithDefaults(workflow, params);
  const replaySelection = parseReplayStepSelection(stepSelection, workflow.steps.length);
  const activeTab = await getCurrentWindowActiveTab();
  if (!activeTab?.id || typeof activeTab.windowId !== 'number') {
    throw new Error('Open a normal browser tab before replaying a workflow.');
  }

  let currentTabId = activeTab.id;
  let currentWindowId = activeTab.windowId;
  const stepResults: WorkflowReplayStepResult[] = [];

  for (let index = 0; index < workflow.steps.length; index += 1) {
    if (!replaySelection.indexes.includes(index)) {
      continue;
    }

    const step = workflow.steps[index];

    if (isWorkflowNavigateStep(step)) {
      if (!step.url) {
        stepResults.push({
          index: index + 1,
          stepId: step.id,
          type: step.type,
          description: step.description,
          tabId: currentTabId,
          success: false,
          error: 'Navigate step is missing a URL.',
        });
        break;
      }

      await chrome.tabs.update(currentTabId, { url: step.url });
      const loadedTab = await waitForTabComplete(currentTabId);
      currentWindowId = loadedTab.windowId ?? currentWindowId;
      stepResults.push({
        index: index + 1,
        stepId: step.id,
        type: step.type,
        description: step.description,
        tabId: currentTabId,
        url: loadedTab.url,
        success: true,
      });
      continue;
    }

    const beforeTab = await chrome.tabs.get(currentTabId);
    const resolvedValue = resolveWorkflowStepValue(step.value, resolvedParams);
    try {
      const executedStep = await executeWorkflowStepOnTab(currentTabId, step, resolvedValue);
      const transition =
        step.type === 'click' || step.type === 'submit'
          ? await detectReplayTargetTab(currentTabId, currentWindowId, beforeTab.url || '')
          : {
              tab: await chrome.tabs.get(currentTabId),
              followedChildTab: false,
            };

      currentTabId = transition.tab.id ?? currentTabId;
      currentWindowId = transition.tab.windowId ?? currentWindowId;

      stepResults.push({
        ...executedStep,
        index: index + 1,
        tabId: currentTabId,
        url: transition.tab.url,
        followedChildTab: transition.followedChildTab || undefined,
      });

      if (!executedStep.success) {
        break;
      }
    } catch (error: any) {
      stepResults.push({
        index: index + 1,
        stepId: step.id,
        type: step.type,
        description: step.description,
        tabId: currentTabId,
        url: beforeTab.url,
        success: false,
        expectedValue:
          typeof resolvedValue === 'string' || typeof resolvedValue === 'boolean'
            ? resolvedValue
            : undefined,
        error: error?.message || 'Replay step failed.',
      });
      break;
    }
  }

  return {
    success: stepResults.every((step) => step.success),
    toolId: storedTool.id,
    toolName: storedTool.name,
    activeTabId: currentTabId,
    steps: stepResults,
    params: resolvedParams,
    selectedSteps: replaySelection.indexes.map((stepIndex) => stepIndex + 1),
    stepSelection: replaySelection.normalized,
    error: stepResults.find((step) => !step.success)?.error,
  };
}

function buildHandler(actions: RecordedAction[]): string {
  const actionsLiteral = JSON.stringify(actions);
  return `async (params = {}) => {
  const recordedActions = ${actionsLiteral};
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalizeSpace = (input) => String(input ?? '').replace(/\\s+/g, ' ').trim();
  const unique = (items) =>
    Array.from(
      new Set(
        items
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean),
      ),
    );
  const cssEscape = (value) => {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(String(value));
    }
    return String(value).replace(/["\\\\]/g, '\\\\$&');
  };
  const safeQueryAll = (selector) => {
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch {
      return [];
    }
  };
  const queryXPathAll = (xpath) => {
    if (!xpath) return [];
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      );
      const nodes = [];
      for (let index = 0; index < result.snapshotLength; index += 1) {
        const item = result.snapshotItem(index);
        if (item instanceof Element) {
          nodes.push(item);
        }
      }
      return nodes;
    } catch {
      return [];
    }
  };
  const isVisible = (element) => {
    if (!(element instanceof HTMLElement)) return true;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };
  const matchesLocatorShape = (element, locator) => {
    if (locator.elementTag && element.tagName.toLowerCase() !== String(locator.elementTag).toLowerCase()) {
      return false;
    }
    if (locator.inputType) {
      if (!(element instanceof HTMLInputElement)) return false;
      if (element.type.toLowerCase() !== String(locator.inputType).toLowerCase()) return false;
    }
    return true;
  };
  const pickElement = (elements, locator) => {
    const scoped = locator ? elements.filter((element) => matchesLocatorShape(element, locator)) : elements;
    return scoped.find((element) => isVisible(element)) || scoped[0] || null;
  };
  const buildAttributeSelectors = (locator) => {
    const tag = locator.elementTag ? String(locator.elementTag).toLowerCase() : '';
    const selectors = [];
    const pushSelector = (selector) => {
      if (selector) selectors.push(selector);
    };
    if (locator.idAttr) {
      pushSelector('#' + cssEscape(locator.idAttr));
      if (tag) {
        pushSelector(tag + '#' + cssEscape(locator.idAttr));
      }
    }
    const attributePairs = [
      ['data-testid', locator.dataTestId],
      ['data-test', locator.dataTest],
      ['name', locator.nameAttr],
      ['aria-label', locator.ariaLabel],
      ['placeholder', locator.placeholder],
    ];
    for (const [attribute, rawValue] of attributePairs) {
      if (!rawValue) continue;
      const value = cssEscape(rawValue);
      if (tag) {
        pushSelector(tag + '[' + attribute + '="' + value + '"]');
      }
      pushSelector('[' + attribute + '="' + value + '"]');
    }
    return unique(selectors);
  };
  const getElementTextCandidates = (element) => {
    const texts = [];
    const pushText = (value) => {
      const normalized = normalizeSpace(value);
      if (normalized) {
        texts.push(normalized);
      }
    };
    if (element instanceof HTMLInputElement) {
      pushText(element.value);
      pushText(element.labels?.[0]?.textContent);
    }
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      pushText(element.value);
      pushText(element.labels?.[0]?.textContent);
    }
    pushText(element.getAttribute('aria-label'));
    pushText(element.textContent);
    return unique(texts);
  };
  const findByAssociatedLabel = (locator) => {
    const texts = unique([locator.label, locator.targetText, locator.ariaLabel, locator.placeholder]);
    for (const text of texts) {
      const desired = normalizeSpace(text);
      if (!desired) continue;
      const labels = Array.from(document.querySelectorAll('label'));
      for (const label of labels) {
        if (normalizeSpace(label.textContent) !== desired) continue;
        const control =
          label.control ||
          label.querySelector('input, textarea, select, [contenteditable="true"]');
        if (control instanceof Element && matchesLocatorShape(control, locator)) {
          return control;
        }
      }
    }
    return null;
  };
  const findByText = (locator) => {
    const texts = unique([locator.targetText, locator.label, locator.ariaLabel]);
    const selectorParts = unique([
      locator.elementTag ? String(locator.elementTag).toLowerCase() : '',
      'button',
      'a',
      'label',
      '[role="button"]',
      '[role="menuitem"]',
      '[role="tab"]',
      'input[type="button"]',
      'input[type="submit"]',
      'input[type="reset"]',
    ]);
    if (selectorParts.length === 0) return null;
    const candidates = safeQueryAll(selectorParts.join(', ')).filter((element) =>
      matchesLocatorShape(element, locator),
    );
    for (const text of texts) {
      const desired = normalizeSpace(text);
      if (!desired) continue;
      const exact = candidates.filter((element) =>
        getElementTextCandidates(element).some((candidate) => candidate === desired),
      );
      const partial = candidates.filter((element) =>
        getElementTextCandidates(element).some(
          (candidate) => candidate.includes(desired) || desired.includes(candidate),
        ),
      );
      const match = pickElement(exact, locator) || pickElement(partial, locator);
      if (match) {
        return match;
      }
    }
    return null;
  };
  const describeLocator = (locator) =>
    unique([
      locator.label,
      locator.targetText,
      locator.ariaLabel,
      locator.placeholder,
      locator.nameAttr,
      locator.idAttr,
      locator.cssSelector || locator.selector,
      locator.xpath,
    ])[0] || 'recorded target';
  const locateElement = (action, strategies) => {
    for (const strategy of strategies) {
      if (strategy === 'label') {
        const element = findByAssociatedLabel(action);
        if (element) return { element, strategy };
      }
      if (strategy === 'text') {
        const element = findByText(action);
        if (element) return { element, strategy };
      }
      if (strategy === 'attrs') {
        for (const selector of buildAttributeSelectors(action)) {
          const element = pickElement(safeQueryAll(selector), action);
          if (element) return { element, strategy: 'attrs:' + selector };
        }
      }
      if (strategy === 'css') {
        const selector = action.cssSelector || action.selector;
        if (selector) {
          const element = pickElement(safeQueryAll(selector), action);
          if (element) return { element, strategy: 'css' };
        }
      }
      if (strategy === 'xpath' && action.xpath) {
        const element = pickElement(queryXPathAll(action.xpath), action);
        if (element) return { element, strategy: 'xpath' };
      }
    }
    return null;
  };
  const waitForElement = async (action, strategies, timeout = 5000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const located = locateElement(action, strategies);
      if (located) return located;
      await sleep(100);
    }
    throw new Error('Element not found for action: ' + describeLocator(action));
  };
  const readValue = (element, fieldType) => {
    if (fieldType === 'checkbox' && element instanceof HTMLInputElement) {
      return element.checked;
    }
    if (fieldType === 'radio' && element instanceof HTMLInputElement) {
      if (element.name) {
        const checked = document.querySelector(
          'input[type="radio"][name="' + cssEscape(element.name) + '"]:checked',
        );
        if (checked instanceof HTMLInputElement) {
          return checked.value;
        }
      }
      return element.checked ? element.value : null;
    }
    if (fieldType === 'contenteditable' && element instanceof HTMLElement) {
      return normalizeSpace(element.textContent);
    }
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      return element.value;
    }
    return normalizeSpace(element.textContent);
  };
  const isValueVerified = (actualValue, expectedValue, fieldType) => {
    if (expectedValue === undefined) return true;
    if (fieldType === 'checkbox') {
      return Boolean(actualValue) === Boolean(expectedValue);
    }
    return String(actualValue ?? '') === String(expectedValue ?? '');
  };
  const setValue = async (element, value, fieldType) => {
    if (fieldType === 'checkbox') {
      if (!(element instanceof HTMLInputElement)) {
        throw new Error('Expected checkbox input but got ' + element.tagName);
      }
      element.checked = Boolean(value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (fieldType === 'radio') {
      if (element instanceof HTMLInputElement && element.name) {
        const radioSelector =
          'input[type="radio"][name="' +
          cssEscape(element.name) +
          '"][value="' +
          cssEscape(value) +
          '"]';
        const radio = document.querySelector(radioSelector);
        if (radio instanceof HTMLInputElement) {
          radio.checked = true;
          radio.dispatchEvent(new Event('input', { bubbles: true }));
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
      if (element instanceof HTMLInputElement) {
        element.checked = true;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      throw new Error('Expected radio input but got ' + element.tagName);
    }
    if (fieldType === 'contenteditable') {
      if (!(element instanceof HTMLElement)) {
        throw new Error('Expected contenteditable element but got ' + element.tagName);
      }
      element.focus();
      element.textContent = value ?? '';
      element.dispatchEvent(new InputEvent('input', { bubbles: true, data: String(value ?? '') }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (element instanceof HTMLSelectElement) {
      element.focus();
      element.value = String(value ?? '');
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.focus();
      element.value = String(value ?? '');
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    throw new Error('Unsupported field element: ' + element.tagName);
  };

  const stepResults = [];

  for (let index = 0; index < recordedActions.length; index += 1) {
    const action = recordedActions[index];
    const preferredStrategies =
      action.type === 'click' || action.type === 'submit'
        ? ['label', 'text', 'attrs', 'css', 'xpath']
        : ['label', 'attrs', 'css', 'xpath', 'text'];
    const located = await waitForElement(action, preferredStrategies);

    if (action.type === 'click') {
      located.element.click();
      stepResults.push({
        index: index + 1,
        type: action.type,
        target: describeLocator(action),
        locatorStrategy: located.strategy,
        success: true,
      });
      await sleep(150);
      continue;
    }

    if (action.type === 'submit') {
      const form =
        located.element instanceof HTMLFormElement
          ? located.element
          : located.element.closest('form');
      if (!(form instanceof HTMLFormElement)) {
        throw new Error('Expected form for action: ' + describeLocator(action));
      }
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.submit();
      }
      stepResults.push({
        index: index + 1,
        type: action.type,
        target: describeLocator(action),
        locatorStrategy: located.strategy,
        success: true,
      });
      await sleep(150);
      continue;
    }

    const paramName = action.paramName || 'field_' + (index + 1);
    const suppliedValue = Object.prototype.hasOwnProperty.call(params, paramName)
      ? params[paramName]
      : action.value;
    await setValue(located.element, suppliedValue, action.fieldType || 'text');
    const observedValue = readValue(located.element, action.fieldType || 'text');
    const verified = isValueVerified(observedValue, suppliedValue, action.fieldType || 'text');
    stepResults.push({
      index: index + 1,
      type: action.type,
      target: describeLocator(action),
      locatorStrategy: located.strategy,
      success: verified,
      paramName,
      expectedValue: suppliedValue,
      observedValue,
    });
    await sleep(100);
  }

  const success = stepResults.every((step) => step.success !== false);
  return {
    success,
    message: success
      ? 'Recorded workflow executed'
      : 'Recorded workflow executed with verification warnings',
    steps: stepResults,
  };
}`;
}

function buildRecordedTool(session: RecordingSession): StoredRecordedTool {
  const actions = assignActionParamNames(sanitizeActions(session.actions));
  const rawWorkflow = buildRecordedWorkflowDocument(session, actions, {
    stage: 'raw',
    parameterizeValues: false,
    mode: 'none',
  });
  const workflow = buildRecordedWorkflowDocument(session, actions, {
    stage: 'parameterized',
    parameterizeValues: true,
    mode: 'heuristic',
  });
  const tool = buildSiteTool(actions, workflow);

  return {
    id: `${session.hostname}:${tool.name}`,
    name: tool.name,
    description: tool.description,
    siteName: session.siteName,
    hostname: session.hostname,
    startUrl: session.startUrl,
    createdAt: session.startedAt,
    updatedAt: workflow.updatedAt,
    actions,
    rawWorkflow,
    workflow,
    tool,
  };
}

function buildUpdatedStoredToolFromSession(
  baseTool: StoredRecordedTool,
  session: RecordingSession,
): StoredRecordedTool {
  const actions = assignActionParamNames(sanitizeActions(session.actions));
  const workflowSeed = {
    ...baseTool.workflow,
    name: slugify(session.toolName) || baseTool.workflow.name || baseTool.name,
    description: session.description || baseTool.workflow.description || baseTool.description,
  } satisfies RecordedWorkflowDocument;
  const normalizedWorkflow = normalizeWorkflowDocument(baseTool, workflowSeed, actions);
  const rawWorkflow = buildRecordedWorkflowDocument(
    {
      ...session,
      startedAt: baseTool.createdAt,
      startUrl: baseTool.startUrl,
      toolName: normalizedWorkflow.name,
      description: normalizedWorkflow.description,
      actions,
    },
    actions,
    {
      stage: 'raw',
      parameterizeValues: false,
      mode: 'none',
    },
  );
  const tool = buildSiteTool(actions, normalizedWorkflow);

  return {
    ...baseTool,
    id: `${baseTool.hostname}:${tool.name}`,
    name: tool.name,
    description: tool.description,
    startUrl: baseTool.startUrl,
    updatedAt: normalizedWorkflow.updatedAt,
    actions,
    rawWorkflow,
    workflow: normalizedWorkflow,
    tool,
  };
}

async function appendRecordedAction(message: RecorderEventMessage): Promise<void> {
  const session = await getActiveSession();
  if (!session || session.sessionId !== message.sessionId) return;

  session.actions = sanitizeActions([...session.actions, message.action]);
  await saveActiveSession(session);
}

async function getCurrentActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

function getSidePanelApi(): SidePanelApi | null {
  const browserApi = (
    globalThis as typeof globalThis & {
      browser?: {
        sidePanel?: SidePanelApi;
      };
    }
  ).browser;

  return chrome.sidePanel ?? browserApi?.sidePanel ?? null;
}

function getRecorderEnvironmentInfo(): RecorderEnvironmentInfo {
  const browserApi = (
    globalThis as typeof globalThis & {
      browser?: {
        sidePanel?: SidePanelApi;
      };
      navigator?: {
        userAgent?: string;
      };
    }
  ).browser;

  return {
    popupHasChromeSidePanel: false,
    popupHasBrowserSidePanel: false,
    backgroundHasChromeSidePanel: Boolean(chrome.sidePanel),
    backgroundHasBrowserSidePanel: Boolean(browserApi?.sidePanel),
    canUseSidePanel: Boolean(getSidePanelApi()),
    userAgent: globalThis.navigator?.userAgent || 'unknown',
  };
}

async function injectRecorder(tabId: number, sessionId: string): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'ISOLATED',
    func: (activeSessionId: string, globalKey: string) => {
      const win = window as unknown as Window & {
        [key: string]:
          | {
              sessionId: string;
              cleanup: () => void;
            }
          | undefined;
      };

      const existing = win[globalKey];
      if (existing?.sessionId === activeSessionId) {
        return;
      }
      existing?.cleanup();

      const pendingInputs = new Map<string, number>();

      const cssEscape = (value: string) => {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
          return CSS.escape(value);
        }
        return value.replace(/["\\]/g, '\\$&');
      };

      const safeQueryCount = (selector: string) => {
        try {
          return document.querySelectorAll(selector).length;
        } catch {
          return 0;
        }
      };

      const normalizeText = (value: string | null | undefined): string =>
        String(value ?? '')
          .replace(/\s+/g, ' ')
          .trim();

      const getLabel = (element: Element): string => {
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          if (element.labels?.length) {
            const label = normalizeText(element.labels[0]?.textContent);
            if (label) return label;
          }
        }

        const directLabel =
          element.getAttribute('aria-label') ||
          element.getAttribute('placeholder') ||
          element.getAttribute('name') ||
          element.getAttribute('data-testid') ||
          element.getAttribute('data-test') ||
          element.getAttribute('id');
        if (directLabel) return directLabel;

        const text = normalizeText((element as HTMLElement).innerText || element.textContent);
        return text ? text.slice(0, 60) : element.tagName.toLowerCase();
      };

      const getTargetText = (element: Element): string | undefined => {
        if (
          element instanceof HTMLInputElement &&
          ['button', 'submit', 'reset'].includes(element.type)
        ) {
          const inputText = normalizeText(element.value);
          if (inputText) return inputText.slice(0, 120);
        }

        const text = normalizeText((element as HTMLElement).innerText || element.textContent);
        if (text) return text.slice(0, 120);

        const ariaLabel = normalizeText(element.getAttribute('aria-label'));
        return ariaLabel || undefined;
      };

      const buildSelector = (element: Element | null): string | null => {
        if (!element) return null;

        const id = element.getAttribute('id');
        if (id) {
          const selector = `#${cssEscape(id)}`;
          if (safeQueryCount(selector) === 1) return selector;
        }

        const uniqueAttrs = ['data-testid', 'data-test', 'name', 'aria-label', 'placeholder'];
        for (const attr of uniqueAttrs) {
          const attrValue = element.getAttribute(attr);
          if (!attrValue) continue;
          const selector = `${element.tagName.toLowerCase()}[${attr}="${cssEscape(attrValue)}"]`;
          if (safeQueryCount(selector) === 1) return selector;
        }

        const path: string[] = [];
        let current: Element | null = element;
        while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
          let segment = current.tagName.toLowerCase();
          const parent: Element | null = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children as HTMLCollectionOf<Element>).filter(
              (candidate) => candidate.tagName === current?.tagName,
            );
            if (siblings.length > 1) {
              segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
            }
          }
          path.unshift(segment);
          const candidate = path.join(' > ');
          if (safeQueryCount(candidate) === 1) {
            return candidate;
          }
          current = parent;
        }

        return path.length > 0 ? path.join(' > ') : null;
      };

      const quoteXPathValue = (value: string): string => {
        if (!value.includes('"')) return `"${value}"`;
        if (!value.includes("'")) return `'${value}'`;
        return `concat(${value
          .split('"')
          .map((part) => `"${part}"`)
          .join(", '\"', ")})`;
      };

      const buildXPath = (element: Element | null): string | null => {
        if (!element) return null;

        const id = element.getAttribute('id');
        if (id) {
          return `//*[@id=${quoteXPathValue(id)}]`;
        }

        const segments: string[] = [];
        let current: Element | null = element;
        while (current && current.nodeType === Node.ELEMENT_NODE) {
          const tagName = current.tagName.toLowerCase();
          let siblingIndex = 1;
          let sibling = current.previousElementSibling;
          while (sibling) {
            if (sibling.tagName === current.tagName) {
              siblingIndex += 1;
            }
            sibling = sibling.previousElementSibling;
          }
          segments.unshift(`${tagName}[${siblingIndex}]`);
          current = current.parentElement;
        }

        return segments.length > 0 ? `/${segments.join('/')}` : null;
      };

      const getFieldType = (element: Element): RecordedFieldType => {
        if (element instanceof HTMLTextAreaElement) return 'textarea';
        if (element instanceof HTMLSelectElement) return 'select';
        if (element instanceof HTMLInputElement) {
          if (element.type === 'checkbox') return 'checkbox';
          if (element.type === 'radio') return 'radio';
          if (element.type === 'submit') return 'submit';
          if (element.type === 'button') return 'button';
          return 'text';
        }
        if (element instanceof HTMLAnchorElement) return 'link';
        if ((element as HTMLElement).isContentEditable) return 'contenteditable';
        return 'unknown';
      };

      const getFieldValue = (element: Element): string | boolean | null => {
        if (element instanceof HTMLInputElement) {
          if (['password', 'file', 'hidden'].includes(element.type)) return null;
          if (element.type === 'checkbox') return element.checked;
          if (element.type === 'radio') return element.value;
          return element.value;
        }
        if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
          return element.value;
        }
        if ((element as HTMLElement).isContentEditable) {
          return element.textContent || '';
        }
        return null;
      };

      const sendAction = (action: RecordedAction) => {
        chrome.runtime
          .sendMessage({
            type: 'webmcp:recording-event',
            sessionId: activeSessionId,
            action,
          })
          .catch(() => {});
      };

      const handleClick = (event: Event) => {
        const target = event.target instanceof Element ? event.target : null;
        const element = target?.closest(
          'a, button, [role="button"], [role="menuitem"], [role="tab"], input, textarea, select, label, summary, [contenteditable="true"]',
        );
        if (!element) return;

        const fieldType = getFieldType(element);
        if (fieldType === 'submit' && element.closest('form')) {
          return;
        }

        const cssSelector = buildSelector(element);
        const xpath = buildXPath(element);
        const selector = cssSelector || xpath;
        if (!selector) return;

        sendAction({
          type: 'click',
          selector,
          cssSelector: cssSelector || undefined,
          xpath: xpath || undefined,
          url: location.href,
          timestamp: Date.now(),
          label: getLabel(element),
          targetText: getTargetText(element),
          fieldType,
          elementTag: element.tagName.toLowerCase(),
          inputType: element instanceof HTMLInputElement ? element.type : undefined,
          ariaLabel: element.getAttribute('aria-label') || undefined,
          placeholder: element.getAttribute('placeholder') || undefined,
          nameAttr: element.getAttribute('name') || undefined,
          idAttr: element.getAttribute('id') || undefined,
          dataTestId: element.getAttribute('data-testid') || undefined,
          dataTest: element.getAttribute('data-test') || undefined,
        });
      };

      const queueInput = (element: Element, type: 'input' | 'change') => {
        const cssSelector = buildSelector(element);
        const xpath = buildXPath(element);
        const selector = cssSelector || xpath;
        if (!selector) return;

        const value = getFieldValue(element);
        if (value === null) return;

        const send = () =>
          sendAction({
            type,
            selector,
            cssSelector: cssSelector || undefined,
            xpath: xpath || undefined,
            url: location.href,
            timestamp: Date.now(),
            label: getLabel(element),
            targetText: getTargetText(element),
            value,
            fieldType: getFieldType(element),
            paramName: getLabel(element),
            elementTag: element.tagName.toLowerCase(),
            inputType: element instanceof HTMLInputElement ? element.type : undefined,
            ariaLabel: element.getAttribute('aria-label') || undefined,
            placeholder: element.getAttribute('placeholder') || undefined,
            nameAttr: element.getAttribute('name') || undefined,
            idAttr: element.getAttribute('id') || undefined,
            dataTestId: element.getAttribute('data-testid') || undefined,
            dataTest: element.getAttribute('data-test') || undefined,
          });

        if (type === 'input') {
          const pending = pendingInputs.get(selector);
          if (pending) {
            window.clearTimeout(pending);
          }
          pendingInputs.set(
            selector,
            window.setTimeout(() => {
              pendingInputs.delete(selector);
              send();
            }, 400),
          );
          return;
        }

        send();
      };

      const handleInput = (event: Event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const fieldType = getFieldType(target);
        if (!['text', 'textarea', 'contenteditable'].includes(fieldType)) return;
        queueInput(target, 'input');
      };

      const handleChange = (event: Event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        queueInput(target, 'change');
      };

      const handleSubmit = (event: Event) => {
        const form = event.target instanceof HTMLFormElement ? event.target : null;
        if (!form) return;
        const cssSelector = buildSelector(form);
        const xpath = buildXPath(form);
        const selector = cssSelector || xpath;
        if (!selector) return;

        sendAction({
          type: 'submit',
          selector,
          cssSelector: cssSelector || undefined,
          xpath: xpath || undefined,
          url: location.href,
          timestamp: Date.now(),
          label: getLabel(form),
          targetText: getTargetText(form),
          fieldType: 'submit',
          elementTag: form.tagName.toLowerCase(),
          ariaLabel: form.getAttribute('aria-label') || undefined,
          nameAttr: form.getAttribute('name') || undefined,
          idAttr: form.getAttribute('id') || undefined,
          dataTestId: form.getAttribute('data-testid') || undefined,
          dataTest: form.getAttribute('data-test') || undefined,
        });
      };

      document.addEventListener('click', handleClick, true);
      document.addEventListener('input', handleInput, true);
      document.addEventListener('change', handleChange, true);
      document.addEventListener('submit', handleSubmit, true);

      win[globalKey] = {
        sessionId: activeSessionId,
        cleanup: () => {
          document.removeEventListener('click', handleClick, true);
          document.removeEventListener('input', handleInput, true);
          document.removeEventListener('change', handleChange, true);
          document.removeEventListener('submit', handleSubmit, true);
          pendingInputs.forEach((timeoutId) => window.clearTimeout(timeoutId));
          pendingInputs.clear();
          if (win[globalKey]?.sessionId === activeSessionId) {
            delete win[globalKey];
          }
        },
      };
    },
    args: [sessionId, RECORDER_GLOBAL_KEY],
  });
}

async function removeRecorder(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: (globalKey: string) => {
        const win = window as unknown as Window & {
          [key: string]:
            | {
                cleanup: () => void;
              }
            | undefined;
        };
        win[globalKey]?.cleanup();
      },
      args: [RECORDER_GLOBAL_KEY],
    });
  } catch (error) {
    console.warn('[WebMCP Recorder] Failed to remove recorder:', error);
  }
}

async function switchRecordingToTab(nextTab: chrome.tabs.Tab): Promise<boolean> {
  if (typeof nextTab.id !== 'number') return false;
  if (nextTab.active === false) return false;

  const session = await getActiveSession();
  if (!session) return false;
  if (nextTab.openerTabId !== session.tabId) return false;

  const previousTabId = session.tabId;
  if (previousTabId === nextTab.id) return true;

  session.tabId = nextTab.id;
  await saveActiveSession(session);

  // Let the click event from the opener flush before cleanup.
  await new Promise((resolve) => setTimeout(resolve, 120));
  await removeRecorder(previousTabId);

  if (isSupportedUrl(nextTab.url) && nextTab.status === 'complete') {
    await injectRecorder(nextTab.id, session.sessionId);
  }

  return true;
}

async function startRecording(toolName?: string, description?: string, appendToToolId?: string) {
  const activeTab = await getCurrentActiveTab();
  if (!activeTab?.id || !isSupportedUrl(activeTab.url)) {
    return {
      success: false,
      error: 'Open an http(s) page before starting recording.',
    };
  }

  const currentSession = await getActiveSession();
  if (currentSession && currentSession.tabId !== activeTab.id) {
    await removeRecorder(currentSession.tabId);
  }

  const hostname = new URL(activeTab.url).hostname;
  let seededActions: RecordedAction[] = [];
  let resolvedToolName = toolName?.trim() || defaultToolName(hostname);
  let resolvedDescription = description?.trim() || `Recorded workflow for ${hostname}`;
  let startedAt = Date.now();

  if (appendToToolId) {
    const storedTools = await getStoredRecordedTools();
    const baseTool = storedTools.find((tool) => tool.id === appendToToolId);
    if (!baseTool) {
      return {
        success: false,
        error: 'The workflow to continue was not found.',
      };
    }
    if (baseTool.hostname !== hostname) {
      return {
        success: false,
        error: `Open a page on ${baseTool.hostname} before continuing this workflow.`,
      };
    }
    seededActions = [...baseTool.actions];
    resolvedToolName = toolName?.trim() || baseTool.name;
    resolvedDescription = description?.trim() || baseTool.description;
    startedAt = baseTool.createdAt;
  }

  const session: RecordingSession = {
    sessionId: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tabId: activeTab.id,
    toolName: resolvedToolName,
    description: resolvedDescription,
    siteName: deriveSiteName(hostname),
    hostname,
    startUrl: appendToToolId ? activeTab.url : activeTab.url,
    startedAt,
    actions: seededActions,
    baseToolId: appendToToolId,
  };

  await saveActiveSession(session);
  await injectRecorder(activeTab.id, session.sessionId);

  return {
    success: true,
    state: {
      isRecording: true,
      tabId: session.tabId,
      toolName: session.toolName,
      description: session.description,
      url: session.startUrl,
      actionCount: session.actions.length,
      startedAt: session.startedAt,
    } satisfies RecorderState,
  };
}

async function stopRecording() {
  const session = await getActiveSession();
  if (!session) {
    return {
      success: false,
      error: 'No active recording session.',
    };
  }

  await removeRecorder(session.tabId);

  if (session.actions.length === 0) {
    await saveActiveSession(null);
    return {
      success: false,
      error: 'No actions were captured.',
    };
  }

  const storedTools = await getStoredRecordedTools();
  const baseTool = session.baseToolId
    ? storedTools.find((tool) => tool.id === session.baseToolId)
    : null;
  const savedTool = baseTool
    ? buildUpdatedStoredToolFromSession(baseTool, session)
    : buildRecordedTool(session);
  const nextTools = storedTools.filter(
    (item) => item.id !== savedTool.id && item.id !== session.baseToolId,
  );
  nextTools.unshift(savedTool);
  await saveStoredRecordedTools(nextTools);
  await saveActiveSession(null);

  return {
    success: true,
    tabId: session.tabId,
    savedTool,
    state: {
      isRecording: false,
      tabId: null,
      toolName: '',
      description: '',
      url: null,
      actionCount: 0,
      startedAt: null,
    } satisfies RecorderState,
  };
}

async function getRecorderState(): Promise<RecorderState> {
  const session = await getActiveSession();
  if (!session) {
    return {
      isRecording: false,
      tabId: null,
      toolName: '',
      description: '',
      url: null,
      actionCount: 0,
      startedAt: null,
    };
  }

  return {
    isRecording: true,
    tabId: session.tabId,
    toolName: session.toolName,
    description: session.description,
    url: session.startUrl,
    actionCount: session.actions.length,
    startedAt: session.startedAt,
  };
}

async function getRecorderSession(): Promise<PublicRecordingSession | null> {
  const session = await getActiveSession();
  if (!session) return null;

  return {
    sessionId: session.sessionId,
    isRecording: true,
    tabId: session.tabId,
    toolName: session.toolName,
    description: session.description,
    url: session.startUrl,
    hostname: session.hostname,
    actionCount: session.actions.length,
    startedAt: session.startedAt,
    actions: session.actions,
  };
}

async function openRecorderSidePanel(options?: { tabId?: number; windowId?: number }): Promise<{
  mode: 'sidepanel' | 'window';
  windowId?: number;
}> {
  const sidePanelApi = getSidePanelApi();

  if (!sidePanelApi) {
    const createdWindow = await chrome.windows.create({
      url: chrome.runtime.getURL('sidepanel.html'),
      type: 'popup',
      width: 440,
      height: 960,
      focused: true,
    });

    return {
      mode: 'window',
      windowId: createdWindow.id,
    };
  }

  const targetTabId = options?.tabId;

  if (typeof targetTabId === 'number') {
    await sidePanelApi.open({ tabId: targetTabId });
    await sidePanelApi.setOptions({
      tabId: targetTabId,
      path: 'sidepanel.html',
      enabled: true,
    });
    return {
      mode: 'sidepanel',
    };
  }

  const targetWindowId =
    typeof options?.windowId === 'number'
      ? options.windowId
      : (await chrome.windows.getCurrent()).id;

  if (typeof targetWindowId !== 'number') {
    throw new Error('Unable to determine browser window for recorder side panel.');
  }

  await sidePanelApi.open({ windowId: targetWindowId });
  await sidePanelApi.setOptions({
    path: 'sidepanel.html',
    enabled: true,
  });
  return {
    mode: 'sidepanel',
  };
}

async function configureRecorderSidePanelAction(): Promise<void> {
  const sidePanelApi = getSidePanelApi();
  await chrome.action.setPopup({ popup: 'popup.html' });
  if (!sidePanelApi) return;

  await sidePanelApi.setOptions({
    path: 'sidepanel.html',
    enabled: true,
  });

  if (sidePanelApi.setPanelBehavior) {
    await sidePanelApi.setPanelBehavior({ openPanelOnActionClick: false });
  }
}

export async function getLocalRecordedSiteConfig(url: string): Promise<SiteConfig | null> {
  if (!isSupportedUrl(url)) return null;

  const hostname = new URL(url).hostname;
  const tools = (await getStoredRecordedTools())
    .filter((tool) => tool.hostname === hostname)
    .map((tool) => tool.tool);

  if (tools.length === 0) return null;

  return {
    urlPattern: buildUrlPattern(url),
    siteName: deriveSiteName(hostname),
    tools: dedupeTools(tools),
  };
}

export async function getLocalRecordedSiteSummaries(): Promise<
  Array<{
    site_name: string;
    url_pattern: string;
    tool_count: number;
    tools: string[];
  }>
> {
  const grouped = new Map<string, StoredRecordedTool[]>();
  const allTools = await getStoredRecordedTools();

  allTools.forEach((tool) => {
    const list = grouped.get(tool.hostname) || [];
    list.push(tool);
    grouped.set(tool.hostname, list);
  });

  return Array.from(grouped.entries()).map(([hostname, tools]) => ({
    site_name: deriveSiteName(hostname),
    url_pattern: `^https?://${escapeRegExp(new URL(tools[0].startUrl).host)}(?:/.*)?$`,
    tool_count: tools.length,
    tools: tools.map((tool) => tool.name),
  }));
}

export function initWebMCPRecorderListener() {
  void configureRecorderSidePanelAction().catch((error) => {
    console.warn('[WebMCP Recorder] Failed to configure side panel action:', error);
  });

  chrome.runtime.onInstalled.addListener(() => {
    void configureRecorderSidePanelAction().catch((error) => {
      console.warn('[WebMCP Recorder] Failed to configure side panel action on install:', error);
    });
  });

  chrome.runtime.onStartup.addListener(() => {
    void configureRecorderSidePanelAction().catch((error) => {
      console.warn('[WebMCP Recorder] Failed to configure side panel action on startup:', error);
    });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'webmcp:recording-event') {
      appendRecordedAction(message as RecorderEventMessage)
        .then(() => sendResponse({ success: true }))
        .catch((error: Error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message?.type === BACKGROUND_MESSAGE_TYPES.START_WEBMCP_RECORDING) {
      startRecording(
        message.toolName,
        message.description,
        message.appendToToolId as string | undefined,
      )
        .then((result) => sendResponse(result))
        .catch((error: Error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message?.type === BACKGROUND_MESSAGE_TYPES.STOP_WEBMCP_RECORDING) {
      stopRecording()
        .then((result) => sendResponse(result))
        .catch((error: Error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message?.type === BACKGROUND_MESSAGE_TYPES.GET_WEBMCP_RECORDING_STATE) {
      getRecorderState()
        .then((state) => sendResponse({ success: true, state }))
        .catch((error: Error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message?.type === BACKGROUND_MESSAGE_TYPES.GET_WEBMCP_RECORDING_SESSION) {
      getRecorderSession()
        .then((session) => sendResponse({ success: true, session }))
        .catch((error: Error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message?.type === BACKGROUND_MESSAGE_TYPES.LIST_LOCAL_WEBMCP_TOOLS) {
      getStoredRecordedTools()
        .then((tools) =>
          sendResponse({
            success: true,
            tools: tools.map((tool) => ({
              id: tool.id,
              name: tool.name,
              description: tool.description,
              hostname: tool.hostname,
              siteName: tool.siteName,
              startUrl: tool.startUrl,
              updatedAt: tool.updatedAt,
              actionCount: tool.actions.length,
              rawWorkflow: tool.rawWorkflow,
              workflow: tool.workflow,
              tool: tool.tool,
            })),
          }),
        )
        .catch((error: Error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message?.type === BACKGROUND_MESSAGE_TYPES.UPDATE_LOCAL_WEBMCP_TOOL_WORKFLOW) {
      persistUpdatedWorkflow(message.id, message.workflow as RecordedWorkflowDocument)
        .then((tool) =>
          sendResponse({
            success: true,
            tool: {
              id: tool.id,
              name: tool.name,
              description: tool.description,
              hostname: tool.hostname,
              siteName: tool.siteName,
              startUrl: tool.startUrl,
              updatedAt: tool.updatedAt,
              actionCount: tool.actions.length,
              rawWorkflow: tool.rawWorkflow,
              workflow: tool.workflow,
              tool: tool.tool,
            },
          }),
        )
        .catch((error: Error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message?.type === BACKGROUND_MESSAGE_TYPES.REFINE_WEBMCP_WORKFLOW_PARAMETERS) {
      refineStoredWorkflowParameters(message.id)
        .then((tool) =>
          sendResponse({
            success: true,
            tool: {
              id: tool.id,
              name: tool.name,
              description: tool.description,
              hostname: tool.hostname,
              siteName: tool.siteName,
              startUrl: tool.startUrl,
              updatedAt: tool.updatedAt,
              actionCount: tool.actions.length,
              rawWorkflow: tool.rawWorkflow,
              workflow: tool.workflow,
              tool: tool.tool,
            },
          }),
        )
        .catch((error: Error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message?.type === BACKGROUND_MESSAGE_TYPES.REPLAY_LOCAL_WEBMCP_WORKFLOW) {
      replayStoredWorkflow(
        message.id,
        message.params as Record<string, unknown> | undefined,
        message.stepSelection as string | undefined,
      )
        .then((result) => sendResponse({ success: true, ...result }))
        .catch((error: Error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message?.type === BACKGROUND_MESSAGE_TYPES.DELETE_LOCAL_WEBMCP_TOOL) {
      getStoredRecordedTools()
        .then(async (tools) => {
          const filtered = tools.filter((tool) => tool.id !== message.id);
          await saveStoredRecordedTools(filtered);
          sendResponse({ success: true });
        })
        .catch((error: Error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message?.type === BACKGROUND_MESSAGE_TYPES.OPEN_WEBMCP_RECORDER_SIDEPANEL) {
      openRecorderSidePanel({ tabId: message.tabId, windowId: message.windowId })
        .then(() => sendResponse({ success: true }))
        .catch((error: Error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message?.type === BACKGROUND_MESSAGE_TYPES.GET_WEBMCP_RECORDER_ENV) {
      sendResponse({
        success: true,
        env: getRecorderEnvironmentInfo(),
      });
      return true;
    }
  });

  chrome.tabs.onCreated.addListener((tab) => {
    void switchRecordingToTab(tab).catch((error) => {
      console.warn('[WebMCP Recorder] Failed to follow child tab:', error);
    });
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    void (async () => {
      if (changeInfo.status === 'complete') {
        const followed = await switchRecordingToTab({
          id: tabId,
          openerTabId: (changeInfo as chrome.tabs.TabChangeInfo & { openerTabId?: number })
            .openerTabId,
          url: changeInfo.url,
          status: 'complete',
        } as chrome.tabs.Tab);
        if (followed) {
          return;
        }
      }

      if (changeInfo.status !== 'complete') return;
      const session = await getActiveSession();
      if (!session || session.tabId !== tabId) return;
      await injectRecorder(tabId, session.sessionId);
    })();
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void (async () => {
      const session = await getActiveSession();
      if (!session || session.tabId !== tabId) return;
      await saveActiveSession(null);
    })();
  });
}
