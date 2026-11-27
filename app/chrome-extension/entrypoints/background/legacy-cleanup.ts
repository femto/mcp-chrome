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
  // Worldbook WebMCP (worldbookWebMCPEnabled is kept so an opt-out survives a rollback)
  'clientId',
  'worldbookApiUrl',
  'webmcpApiUrl',
];

const LEGACY_CACHE_NAMES = ['onnx-model-cache-v1', 'transformers-cache'];
const LEGACY_DATABASES = ['VectorDatabaseStorage', '/hnswlib-index'];

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Failed to delete ${name}`));
    // A blocked delete stays pending and completes once open connections close
    request.onblocked = () => console.warn(`Background: Deletion of ${name} is blocked`);
  });
}

export async function runLegacyCleanup(): Promise<void> {
  const result = await chrome.storage.local.get([LEGACY_CLEANUP_KEY]);
  if ((result[LEGACY_CLEANUP_KEY] ?? 0) >= LEGACY_CLEANUP_VERSION) return;

  // Run every deletion so partial progress is kept, but only mark the cleanup
  // complete when all of them succeed; otherwise the next startup retries.
  const results = await Promise.allSettled([
    chrome.storage.local.remove(LEGACY_STORAGE_KEYS),
    ...LEGACY_CACHE_NAMES.map((name) => caches.delete(name)),
    ...LEGACY_DATABASES.map(deleteDatabase),
  ]);
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((f) => f.reason),
      'Legacy data cleanup incomplete, will retry on next startup',
    );
  }

  await chrome.storage.local.set({ [LEGACY_CLEANUP_KEY]: LEGACY_CLEANUP_VERSION });
  console.log('Background: Legacy semantic engine and Worldbook data cleaned up');
}
