/**
 * One-time cleanup of data left behind by removed features
 * (semantic search engine and Worldbook WebMCP integration)
 */

const LEGACY_CLEANUP_KEY = 'legacyCleanupVersion';
const LEGACY_CLEANUP_VERSION = 1;

const LEGACY_STORAGE_KEYS = [
  // Semantic engine / vector index
  'selectedModel',
  'selectedVersion',
  'modelState',
  'semanticEngineState',
  'vectorDatabaseStats',
  'lastCleanupTime',
  'contentIndexerStats',
  'vectorIndex',
  'hnswlib_document_mappings_tab_content_index.dat',
  'hnswlib_document_mappings_content_index.dat',
  'hnswlib_document_mappings_vector_index.dat',
  // Worldbook WebMCP
  'clientId',
  'worldbookWebMCPEnabled',
  'worldbookApiUrl',
  'webmcpApiUrl',
];

const LEGACY_CACHE_NAMES = ['onnx-model-cache-v1', 'transformers-cache'];
const LEGACY_DATABASES = ['VectorDatabaseStorage', '/hnswlib-index'];

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

export async function runLegacyCleanup(): Promise<void> {
  const result = await chrome.storage.local.get([LEGACY_CLEANUP_KEY]);
  if ((result[LEGACY_CLEANUP_KEY] ?? 0) >= LEGACY_CLEANUP_VERSION) return;

  await chrome.storage.local.remove(LEGACY_STORAGE_KEYS);
  await Promise.all(LEGACY_CACHE_NAMES.map((name) => caches.delete(name).catch(() => false)));
  await Promise.all(LEGACY_DATABASES.map(deleteDatabase));

  await chrome.storage.local.set({ [LEGACY_CLEANUP_KEY]: LEGACY_CLEANUP_VERSION });
  console.log('Background: Legacy semantic engine and Worldbook data cleaned up');
}
