/* eslint-disable */
// snapshot-helper.js
// Produces a semantic page snapshot with stable refs for AI-driven interactions.

(function () {
  if (window.__SNAPSHOT_HELPER_INITIALIZED__) {
    return;
  }
  window.__SNAPSHOT_HELPER_INITIALIZED__ = true;

  const VALID_ROLES = new Set([
    'alert',
    'alertdialog',
    'application',
    'article',
    'banner',
    'blockquote',
    'button',
    'caption',
    'cell',
    'checkbox',
    'code',
    'columnheader',
    'combobox',
    'complementary',
    'contentinfo',
    'definition',
    'dialog',
    'directory',
    'document',
    'emphasis',
    'figure',
    'form',
    'generic',
    'grid',
    'gridcell',
    'group',
    'heading',
    'img',
    'link',
    'list',
    'listbox',
    'listitem',
    'log',
    'main',
    'mark',
    'math',
    'menu',
    'menubar',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'meter',
    'navigation',
    'note',
    'option',
    'paragraph',
    'presentation',
    'progressbar',
    'radio',
    'radiogroup',
    'region',
    'row',
    'rowgroup',
    'rowheader',
    'scrollbar',
    'search',
    'searchbox',
    'separator',
    'slider',
    'spinbutton',
    'status',
    'strong',
    'switch',
    'tab',
    'table',
    'tablist',
    'tabpanel',
    'term',
    'textbox',
    'time',
    'timer',
    'toolbar',
    'tooltip',
    'tree',
    'treegrid',
    'treeitem',
  ]);

  const INTERACTIVE_ROLES = new Set([
    'button',
    'checkbox',
    'combobox',
    'link',
    'listbox',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'radio',
    'scrollbar',
    'searchbox',
    'slider',
    'spinbutton',
    'switch',
    'tab',
    'textbox',
    'treeitem',
  ]);

  const NAME_FROM_CONTENT_ROLES = new Set([
    'button',
    'cell',
    'checkbox',
    'columnheader',
    'gridcell',
    'heading',
    'link',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'radio',
    'row',
    'rowheader',
    'switch',
    'tab',
    'tooltip',
    'treeitem',
  ]);

  let lastRef = 0;
  let cacheDepth = 0;
  let styleCache;
  let elementVisibilityCache;
  let textVisibilityCache;
  let accessibleNameCache;
  let pointerEventsCache;

  function beginSnapshotCaches() {
    cacheDepth += 1;
    if (cacheDepth > 1) return;
    styleCache = new Map();
    elementVisibilityCache = new Map();
    textVisibilityCache = new Map();
    accessibleNameCache = new Map();
    pointerEventsCache = new Map();
  }

  function endSnapshotCaches() {
    cacheDepth -= 1;
    if (cacheDepth > 0) return;
    cacheDepth = 0;
    styleCache = undefined;
    elementVisibilityCache = undefined;
    textVisibilityCache = undefined;
    accessibleNameCache = undefined;
    pointerEventsCache = undefined;
  }

  function normalizeWhiteSpace(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[\u200b\u00ad]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getComputedStyleSafe(element, pseudo) {
    if (!pseudo && styleCache && styleCache.has(element)) {
      return styleCache.get(element);
    }
    try {
      const style = window.getComputedStyle(element, pseudo);
      if (!pseudo && styleCache) {
        styleCache.set(element, style);
      }
      return style;
    } catch {
      return null;
    }
  }

  function isVisibleTextNode(node) {
    if (!node || !node.nodeValue || !normalizeWhiteSpace(node.nodeValue)) return false;
    if (textVisibilityCache && textVisibilityCache.has(node)) {
      return textVisibilityCache.get(node);
    }
    let visible = false;
    try {
      const range = node.ownerDocument.createRange();
      range.selectNode(node);
      const rect = range.getBoundingClientRect();
      visible = rect.width > 0 && rect.height > 0;
    } catch {
      visible = false;
    }
    if (textVisibilityCache) {
      textVisibilityCache.set(node, visible);
    }
    return visible;
  }

  function isVisibleElement(element) {
    if (!element || !element.isConnected) return false;
    if (elementVisibilityCache && elementVisibilityCache.has(element)) {
      return elementVisibilityCache.get(element);
    }
    const style = getComputedStyleSafe(element);
    let visible = true;
    if (
      style &&
      (style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity || '1') === 0)
    ) {
      visible = false;
    } else if (element.closest('[aria-hidden="true"]')) {
      visible = false;
    } else if (style && style.display === 'contents') {
      visible = false;
      for (let child = element.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.ELEMENT_NODE && isVisibleElement(child)) {
          visible = true;
          break;
        }
        if (child.nodeType === Node.TEXT_NODE && isVisibleTextNode(child)) {
          visible = true;
          break;
        }
      }
    } else {
      const rect = element.getBoundingClientRect();
      visible = rect.width > 0 && rect.height > 0;
    }
    if (elementVisibilityCache) {
      elementVisibilityCache.set(element, visible);
    }
    return visible;
  }

  function receivesPointerEvents(element) {
    if (pointerEventsCache && pointerEventsCache.has(element)) {
      return pointerEventsCache.get(element);
    }
    const visited = [];
    let result = true;
    for (let current = element; current; current = current.parentElement) {
      if (pointerEventsCache && pointerEventsCache.has(current)) {
        result = pointerEventsCache.get(current);
        break;
      }
      visited.push(current);
      const style = getComputedStyleSafe(current);
      if (style && style.pointerEvents === 'none') {
        result = false;
        break;
      }
    }
    if (pointerEventsCache) {
      for (const current of visited) {
        pointerEventsCache.set(current, result);
      }
    }
    return result;
  }

  function getExplicitRole(element) {
    const roles = (element.getAttribute('role') || '')
      .split(/\s+/)
      .map((role) => role.trim())
      .filter(Boolean);
    return roles.find((role) => VALID_ROLES.has(role)) || null;
  }

  function getImplicitRole(element) {
    const tag = element.tagName.toUpperCase();
    if ((tag === 'A' || tag === 'AREA') && element.hasAttribute('href')) return 'link';
    if (tag === 'BUTTON') return 'button';
    if (tag === 'SELECT') return element.multiple || element.size > 1 ? 'listbox' : 'combobox';
    if (tag === 'TEXTAREA') return 'textbox';
    if (tag === 'INPUT') {
      const type = (element.getAttribute('type') || 'text').toLowerCase();
      if (type === 'hidden') return null;
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'range') return 'slider';
      if (type === 'number') return 'spinbutton';
      if (['button', 'submit', 'reset', 'image', 'file'].includes(type)) return 'button';
      if (type === 'search') return 'searchbox';
      return 'textbox';
    }
    if (/^H[1-6]$/.test(tag)) return 'heading';
    if (tag === 'IMG') return 'img';
    if (tag === 'NAV') return 'navigation';
    if (tag === 'MAIN') return 'main';
    if (tag === 'ARTICLE') return 'article';
    if (tag === 'SECTION' && getAccessibleName(element, 'region')) return 'region';
    if (tag === 'UL' || tag === 'OL') return 'list';
    if (tag === 'LI') return 'listitem';
    if (tag === 'TABLE') return 'table';
    if (tag === 'TR') return 'row';
    if (tag === 'TD') return 'cell';
    if (tag === 'TH') return 'columnheader';
    if (tag === 'IFRAME') return 'iframe';
    return null;
  }

  function getRole(element) {
    const explicitRole = getExplicitRole(element);
    if (explicitRole && explicitRole !== 'presentation' && explicitRole !== 'none') {
      return explicitRole;
    }
    return getImplicitRole(element);
  }

  function getLabelledByText(element) {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (!labelledBy) return '';
    const ids = labelledBy.split(/\s+/).filter(Boolean);
    return normalizeWhiteSpace(
      ids
        .map((id) => {
          const labelElement = element.ownerDocument.getElementById(id);
          return labelElement ? labelElement.textContent || '' : '';
        })
        .join(' '),
    );
  }

  function getAccessibleName(element, role) {
    if (accessibleNameCache && accessibleNameCache.has(element)) {
      return accessibleNameCache.get(element);
    }

    const labelledBy = getLabelledByText(element);
    if (labelledBy) {
      if (accessibleNameCache) accessibleNameCache.set(element, labelledBy);
      return labelledBy;
    }

    const ariaLabel = normalizeWhiteSpace(element.getAttribute('aria-label') || '');
    if (ariaLabel) {
      if (accessibleNameCache) accessibleNameCache.set(element, ariaLabel);
      return ariaLabel;
    }

    if (element.id) {
      const label = element.ownerDocument.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label) {
        const text = normalizeWhiteSpace(label.textContent || '');
        if (text) {
          if (accessibleNameCache) accessibleNameCache.set(element, text);
          return text;
        }
      }
    }

    const parentLabel = element.closest('label');
    if (parentLabel) {
      const text = normalizeWhiteSpace(parentLabel.textContent || '');
      if (text) {
        if (accessibleNameCache) accessibleNameCache.set(element, text);
        return text;
      }
    }

    if (element.tagName === 'IMG') {
      const alt = normalizeWhiteSpace(element.getAttribute('alt') || '');
      if (alt) {
        if (accessibleNameCache) accessibleNameCache.set(element, alt);
        return alt;
      }
    }

    if (element.tagName === 'INPUT') {
      const type = (element.getAttribute('type') || 'text').toLowerCase();
      if (['button', 'submit', 'reset'].includes(type)) {
        const value = normalizeWhiteSpace(element.value || '');
        if (value) {
          if (accessibleNameCache) accessibleNameCache.set(element, value);
          return value;
        }
      }
    }

    const title = normalizeWhiteSpace(element.getAttribute('title') || '');
    if (title) {
      if (accessibleNameCache) accessibleNameCache.set(element, title);
      return title;
    }

    const resolvedRole = role || getRole(element) || 'generic';
    if (
      (resolvedRole === 'textbox' || resolvedRole === 'searchbox' || resolvedRole === 'combobox') &&
      element.hasAttribute('placeholder')
    ) {
      const placeholder = normalizeWhiteSpace(element.getAttribute('placeholder') || '');
      if (placeholder) {
        if (accessibleNameCache) accessibleNameCache.set(element, placeholder);
        return placeholder;
      }
    }

    const name = NAME_FROM_CONTENT_ROLES.has(resolvedRole)
      ? normalizeWhiteSpace(element.textContent || '')
      : '';
    if (accessibleNameCache) {
      accessibleNameCache.set(element, name);
    }
    return name;
  }

  function getLevel(element, role) {
    if (role !== 'heading') return 0;
    const tag = element.tagName.toUpperCase();
    if (/^H[1-6]$/.test(tag)) return Number(tag.substring(1));
    const ariaLevel = Number(element.getAttribute('aria-level'));
    return Number.isInteger(ariaLevel) && ariaLevel > 0 ? ariaLevel : 0;
  }

  function getChecked(element, role) {
    if (
      !['checkbox', 'radio', 'menuitemcheckbox', 'menuitemradio', 'switch', 'option'].includes(role)
    )
      return undefined;
    if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) {
      if (element.indeterminate) return 'mixed';
      return element.checked;
    }
    const ariaChecked = element.getAttribute('aria-checked');
    if (ariaChecked === 'mixed') return 'mixed';
    if (ariaChecked === 'true') return true;
    if (ariaChecked === 'false') return false;
    return undefined;
  }

  function isDisabled(element) {
    return element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
  }

  function isExpanded(element) {
    if (element.tagName === 'DETAILS') return element.open;
    const ariaExpanded = element.getAttribute('aria-expanded');
    if (ariaExpanded === 'true') return true;
    if (ariaExpanded === 'false') return false;
    return undefined;
  }

  function isSelected(element, role) {
    if (!['option', 'tab', 'treeitem', 'gridcell', 'row'].includes(role)) return undefined;
    if (element.tagName === 'OPTION') return element.selected;
    const ariaSelected = element.getAttribute('aria-selected');
    if (ariaSelected === 'true') return true;
    if (ariaSelected === 'false') return false;
    return undefined;
  }

  function isRefEligible(element, role) {
    if (!role) return false;
    if (!isVisibleElement(element) || !receivesPointerEvents(element)) return false;
    if (INTERACTIVE_ROLES.has(role)) return true;
    if (
      element.tagName === 'BUTTON' ||
      element.tagName === 'SELECT' ||
      element.tagName === 'TEXTAREA'
    )
      return true;
    if (element.tagName === 'INPUT') return element.type !== 'hidden';
    return false;
  }

  function assignRef(element, role, name, includeRefs) {
    if (!includeRefs || !isRefEligible(element, role)) return undefined;
    const cached = element.__mcpChromeSnapshotRef;
    if (cached && cached.role === role && cached.name === name) return cached.ref;
    const ref = `e${++lastRef}`;
    element.__mcpChromeSnapshotRef = { ref, role, name };
    return ref;
  }

  function hasNodeState(node) {
    return (
      node.disabled !== undefined ||
      node.checked !== undefined ||
      node.expanded !== undefined ||
      node.selected !== undefined ||
      node.level !== undefined ||
      node.active !== undefined
    );
  }

  function isMeaninglessGeneric(node) {
    return (
      node.role === 'generic' &&
      !node.name &&
      !node.ref &&
      !hasNodeState(node) &&
      Object.keys(node.props).length === 0
    );
  }

  function normalizeChildren(children) {
    const normalizedChildren = [];
    const textBuffer = [];

    const flushText = () => {
      if (!textBuffer.length) return;
      const text = normalizeWhiteSpace(textBuffer.join(' '));
      if (text) normalizedChildren.push(text);
      textBuffer.length = 0;
    };

    for (const child of children) {
      if (!child) continue;
      if (typeof child === 'string') {
        textBuffer.push(child);
        continue;
      }
      flushText();
      normalizedChildren.push(child);
    }

    flushText();
    return normalizedChildren;
  }

  function compactNode(node, isRoot) {
    const compactedChildren = [];
    for (const child of node.children) {
      if (typeof child === 'string') {
        compactedChildren.push(child);
        continue;
      }
      const compacted = compactNode(child, false);
      if (!compacted) continue;
      if (Array.isArray(compacted)) {
        compactedChildren.push(...compacted);
      } else {
        compactedChildren.push(compacted);
      }
    }

    node.children = normalizeChildren(compactedChildren);

    if (
      node.name &&
      node.children.length &&
      node.children.every((child) => typeof child === 'string')
    ) {
      const combinedText = normalizeWhiteSpace(node.children.join(' '));
      if (combinedText && combinedText === node.name) {
        node.children = [];
      }
    }

    if (!isMeaninglessGeneric(node)) {
      return node;
    }
    if (!node.children.length) {
      return isRoot ? node : null;
    }
    if (node.children.length === 1) {
      return isRoot ? node.children : node.children[0];
    }
    if (node.children.every((child) => typeof child !== 'string' && child.ref)) {
      return isRoot ? node.children : node.children;
    }
    return node;
  }

  function createNode(element, includeRefs) {
    if (!isVisibleElement(element)) return null;

    const role = getRole(element) || 'generic';
    const name = getAccessibleName(element, role);
    const ref = assignRef(element, role, name, includeRefs);
    const node = {
      role,
      name,
      ref,
      disabled: isDisabled(element) || undefined,
      checked: getChecked(element, role),
      expanded: isExpanded(element),
      selected: isSelected(element, role),
      level: getLevel(element, role) || undefined,
      active: element.ownerDocument.activeElement === element || undefined,
      props: {},
      children: [],
      element,
    };

    if (role === 'link' && element.hasAttribute('href')) {
      node.props.url = element.getAttribute('href') || '';
    }
    if (role === 'textbox' && element.hasAttribute('placeholder')) {
      const placeholder = normalizeWhiteSpace(element.getAttribute('placeholder') || '');
      if (placeholder && placeholder !== name) node.props.placeholder = placeholder;
    }
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      const value = normalizeWhiteSpace(element.value || '');
      if (value && role === 'textbox') node.children.push(value);
    }

    const textBuffer = [];
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = normalizeWhiteSpace(child.nodeValue || '');
        if (text && isVisibleTextNode(child)) textBuffer.push(text);
        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const childNode = createNode(child, includeRefs);
      if (childNode) {
        if (textBuffer.length) {
          node.children.push(normalizeWhiteSpace(textBuffer.join(' ')));
          textBuffer.length = 0;
        }
        node.children.push(childNode);
      }
    }

    if (textBuffer.length) {
      node.children.push(normalizeWhiteSpace(textBuffer.join(' ')));
    }

    if (name && node.children.length && node.children.every((child) => typeof child === 'string')) {
      const combinedText = normalizeWhiteSpace(node.children.join(' '));
      if (combinedText === name) node.children = [];
    }

    if (!name && node.children.length === 1 && node.children[0] === name) {
      node.children = [];
    }

    return node;
  }

  function escapeYamlValue(value) {
    const text = String(value ?? '');
    if (!text) return '""';
    if (/[:{}\[\],&*#?|<>=!%@`]/.test(text) || /\s/.test(text)) {
      return JSON.stringify(text);
    }
    return text;
  }

  function renderKey(node) {
    let key = node.role;
    if (node.name) key += ` ${JSON.stringify(node.name)}`;
    if (node.checked === 'mixed') key += ' [checked=mixed]';
    else if (node.checked === true) key += ' [checked]';
    if (node.disabled) key += ' [disabled]';
    if (node.expanded) key += ' [expanded]';
    if (node.selected) key += ' [selected]';
    if (node.active) key += ' [active]';
    if (node.level) key += ` [level=${node.level}]`;
    if (node.ref) key += ` [ref=${node.ref}]`;
    return key;
  }

  function renderYaml(node, indent, lines) {
    const props = Object.entries(node.props);
    const childIndent = indent + '  ';
    const inlineTextChild =
      node.children.length === 1 &&
      typeof node.children[0] === 'string' &&
      props.length === 0 &&
      !node.name;

    const key = `${indent}- ${renderKey(node)}`;
    if (!node.children.length && props.length === 0) {
      lines.push(key);
      return;
    }
    if (inlineTextChild) {
      lines.push(`${key}: ${escapeYamlValue(node.children[0])}`);
      return;
    }

    lines.push(`${key}:`);
    for (const [propName, propValue] of props) {
      lines.push(`${childIndent}- /${propName}: ${escapeYamlValue(propValue)}`);
    }
    for (const child of node.children) {
      if (typeof child === 'string') {
        lines.push(`${childIndent}- text: ${escapeYamlValue(child)}`);
      } else {
        renderYaml(child, childIndent, lines);
      }
    }
  }

  function stripElements(node) {
    return {
      role: node.role,
      name: node.name,
      ref: node.ref,
      disabled: node.disabled,
      checked: node.checked,
      expanded: node.expanded,
      selected: node.selected,
      active: node.active,
      level: node.level,
      props: node.props,
      children: node.children.map((child) =>
        typeof child === 'string' ? child : stripElements(child),
      ),
    };
  }

  function buildSnapshot(rootElement, format, includeRefs) {
    beginSnapshotCaches();
    try {
      const createdRoot = createNode(rootElement, includeRefs);
      const compactedRoot = createdRoot ? compactNode(createdRoot, true) : null;
      let rootNode;

      if (!compactedRoot) {
        rootNode = {
          role: 'fragment',
          name: '',
          ref: undefined,
          props: {},
          children: [],
          element: rootElement,
        };
      } else if (typeof compactedRoot === 'string') {
        rootNode = {
          role: 'fragment',
          name: '',
          ref: undefined,
          props: {},
          children: [compactedRoot],
          element: rootElement,
        };
      } else if (Array.isArray(compactedRoot)) {
        rootNode = {
          role: 'fragment',
          name: '',
          ref: undefined,
          props: {},
          children: normalizeChildren(compactedRoot),
          element: rootElement,
        };
      } else {
        rootNode = compactedRoot;
      }

      const refsObject = {};
      if (includeRefs) {
        const collectRefs = (node) => {
          if (node.ref) refsObject[node.ref] = node.element;
          for (const child of node.children) {
            if (typeof child !== 'string') collectRefs(child);
          }
        };
        collectRefs(rootNode);
      }
      window.__mcpChromeSnapshotRefs = refsObject;

      if (format === 'json') {
        return {
          snapshot: JSON.stringify(stripElements(rootNode), null, 2),
          refCount: Object.keys(refsObject).length,
          format: 'json',
        };
      }

      const lines = [];
      const yamlRoots =
        rootNode.role === 'fragment'
          ? rootNode.children.filter((child) => typeof child !== 'string')
          : [rootNode];

      if (rootNode.role === 'fragment') {
        for (const child of rootNode.children) {
          if (typeof child === 'string') {
            lines.push(`- text: ${escapeYamlValue(child)}`);
          } else {
            renderYaml(child, '', lines);
          }
        }
      } else {
        for (const child of yamlRoots) {
          renderYaml(child, '', lines);
        }
      }

      return {
        snapshot: lines.join('\n'),
        refCount: Object.keys(refsObject).length,
        format: 'yaml',
      };
    } finally {
      endSnapshotCaches();
    }
  }

  function getSnapshotRoot(selector) {
    if (!selector) return document.body || document.documentElement;
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`No element found matching selector: ${selector}`);
    }
    return element;
  }

  function selectSnapshotRef(ref) {
    const refs = window.__mcpChromeSnapshotRefs;
    if (!refs) throw new Error('No snapshot refs found. Call getPageSnapshot first.');
    const element = refs[ref];
    if (!element) {
      throw new Error(`Ref "${ref}" not found. Call chrome_page_snapshot again.`);
    }
    return element;
  }

  window.__mcpChromeSelectSnapshotRef = selectSnapshotRef;

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'getPageSnapshot') {
      try {
        const root = getSnapshotRoot(request.selector);
        const result = buildSnapshot(
          root,
          request.format === 'json' ? 'json' : 'yaml',
          request.includeRefs !== false,
        );
        sendResponse({ success: true, ...result });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }
    if (request.action === 'chrome_page_snapshot_ping') {
      sendResponse({ status: 'pong' });
      return false;
    }
  });
})();
