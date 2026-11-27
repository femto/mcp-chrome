import { initNativeHostListener } from './native-host';
import { runLegacyCleanup } from './legacy-cleanup';
import { initWebMCPListener } from '@/webmcp';

/**
 * Background script entry point
 * Initializes all background services and listeners
 */
export default defineBackground(() => {
  // Initialize core services
  initNativeHostListener();
  initWebMCPListener(); // Initialize WebMCP dynamic site tools

  runLegacyCleanup().catch((error) => {
    console.warn('Background: Legacy data cleanup failed:', error);
  });
});
