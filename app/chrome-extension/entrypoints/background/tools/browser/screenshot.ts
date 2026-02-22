import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'mcp-chrome-shared';
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';
import { TIMEOUTS, ERROR_MESSAGES } from '@/common/constants';
import {
  canvasToDataURL,
  createImageBitmapFromUrl,
  cropAndResizeImage,
  stitchImages,
  compressImage,
} from '../../../../utils/image-utils';
import { setLastScreenshotContext, type ScreenshotScope } from './screenshot-context';

// Screenshot-specific constants
const SCREENSHOT_CONSTANTS = {
  SCROLL_DELAY_MS: 350, // Time to wait after scroll for rendering and lazy loading
  CAPTURE_STITCH_DELAY_MS: 50, // Small delay between captures in a scroll sequence
  MAX_CAPTURE_PARTS: 50, // Maximum number of parts to capture (for infinite scroll pages)
  MAX_CAPTURE_HEIGHT_PX: 50000, // Maximum height in pixels to capture
  PIXEL_TOLERANCE: 1,
  SCRIPT_INIT_DELAY: 100, // Delay for script initialization
  MAX_BASE64_DIMENSION_PX: 1800, // Max dimension for base64 output (multi-image API limit is 2000, leave buffer)
} as {
  readonly SCROLL_DELAY_MS: number;
  CAPTURE_STITCH_DELAY_MS: number; // This one is mutable
  readonly MAX_CAPTURE_PARTS: number;
  readonly MAX_CAPTURE_HEIGHT_PX: number;
  readonly PIXEL_TOLERANCE: number;
  readonly SCRIPT_INIT_DELAY: number;
  readonly MAX_BASE64_DIMENSION_PX: number;
};

SCREENSHOT_CONSTANTS['CAPTURE_STITCH_DELAY_MS'] = Math.max(
  1000 / chrome.tabs.MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND -
    SCREENSHOT_CONSTANTS.SCROLL_DELAY_MS,
  SCREENSHOT_CONSTANTS.CAPTURE_STITCH_DELAY_MS,
);

interface ScreenshotToolParams {
  name: string;
  selector?: string;
  width?: number;
  height?: number;
  storeBase64?: boolean;
  fullPage?: boolean;
  savePng?: boolean;
  maxHeight?: number; // Maximum height to capture in pixels (for infinite scroll pages)
}

/**
 * Tool for capturing screenshots of web pages
 */
class ScreenshotTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.SCREENSHOT;

  /**
   * Execute screenshot operation
   */
  async execute(args: ScreenshotToolParams): Promise<ToolResult> {
    const {
      name = 'screenshot',
      selector,
      storeBase64 = false,
      fullPage = false,
      savePng = true,
    } = args;

    console.log(`Starting screenshot with options:`, args);

    // Get current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) {
      return createErrorResponse(ERROR_MESSAGES.TAB_NOT_FOUND);
    }
    const tab = tabs[0];

    // Check URL restrictions
    if (
      tab.url?.startsWith('chrome://') ||
      tab.url?.startsWith('edge://') ||
      tab.url?.startsWith('https://chrome.google.com/webstore') ||
      tab.url?.startsWith('https://microsoftedge.microsoft.com/')
    ) {
      return createErrorResponse(
        'Cannot capture special browser pages or web store pages due to security restrictions.',
      );
    }

    let finalImageDataUrl: string | undefined;
    const results: any = { base64: null, fileSaved: false };
    let originalScroll = { x: 0, y: 0 };

    try {
      await this.injectContentScript(tab.id!, ['inject-scripts/screenshot-helper.js']);
      // Wait for script initialization
      await new Promise((resolve) => setTimeout(resolve, SCREENSHOT_CONSTANTS.SCRIPT_INIT_DELAY));
      // 1. Prepare page (hide scrollbars, potentially fixed elements)
      await this.sendMessageToTab(tab.id!, {
        action: TOOL_MESSAGE_TYPES.SCREENSHOT_PREPARE_PAGE_FOR_CAPTURE,
        options: { fullPage },
      });

      // Get initial page details, including original scroll position
      const pageDetails = await this.sendMessageToTab(tab.id!, {
        action: TOOL_MESSAGE_TYPES.SCREENSHOT_GET_PAGE_DETAILS,
      });
      originalScroll = { x: pageDetails.currentScrollX, y: pageDetails.currentScrollY };

      let sourceCssWidth: number | undefined;
      let sourceCssHeight: number | undefined;
      let scope: ScreenshotScope = 'viewport';
      let elementRect:
        | {
            x: number;
            y: number;
            width: number;
            height: number;
          }
        | undefined;
      let elementScroll:
        | {
            x: number;
            y: number;
          }
        | undefined;

      if (fullPage) {
        this.logInfo('Capturing full page...');
        const fullPageResult = await this._captureFullPage(tab.id!, args, pageDetails);
        finalImageDataUrl = fullPageResult.dataUrl;
        sourceCssWidth = fullPageResult.cssWidth;
        sourceCssHeight = fullPageResult.cssHeight;
        scope = 'fullPage';
      } else if (selector) {
        this.logInfo(`Capturing element: ${selector}`);
        const elementResult = await this._captureElement(
          tab.id!,
          args,
          pageDetails.devicePixelRatio,
        );
        finalImageDataUrl = elementResult.dataUrl;
        sourceCssWidth = elementResult.cssWidth;
        sourceCssHeight = elementResult.cssHeight;
        elementRect = elementResult.elementRect;
        elementScroll = elementResult.elementScroll;
        scope = 'element';
      } else {
        // Visible area only
        this.logInfo('Capturing visible area...');
        finalImageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        sourceCssWidth = pageDetails.viewportWidth;
        sourceCssHeight = pageDetails.viewportHeight;
        scope = 'viewport';
      }

      if (!finalImageDataUrl) {
        throw new Error('Failed to capture image data');
      }

      // 2. Process output
      if (storeBase64 === true) {
        // Compress image for base64 output to reduce size
        // Pass devicePixelRatio so originalWidth/Height are reported in CSS pixels (for click coordinates)
        const compressed = await compressImage(finalImageDataUrl, {
          scale: 0.7, // Reduce dimensions by 30%
          quality: 0.8, // 80% quality for good balance
          format: 'image/jpeg', // JPEG for better compression
          maxDimension: SCREENSHOT_CONSTANTS.MAX_BASE64_DIMENSION_PX, // Ensure within API limits
          devicePixelRatio: pageDetails.devicePixelRatio || 1, // Convert device pixels to CSS pixels
          sourceCssWidth,
          sourceCssHeight,
        });

        // Include base64 data in response (without prefix)
        const base64Data = compressed.dataUrl.replace(/^data:image\/[^;]+;base64,/, '');
        results.base64 = base64Data;

        // Build scale info for AI to convert coordinates (CSS pixels)
        const scaleX = compressed.scaleX ?? compressed.scale;
        const scaleY = compressed.scaleY ?? compressed.scale;
        setLastScreenshotContext(tab.id!, {
          scope,
          scaleX,
          scaleY,
          cssWidth: compressed.originalWidth,
          cssHeight: compressed.originalHeight,
          scaledWidth: compressed.scaledWidth,
          scaledHeight: compressed.scaledHeight,
          scrollX: originalScroll.x,
          scrollY: originalScroll.y,
          elementRect,
          elementScrollX: elementScroll?.x,
          elementScrollY: elementScroll?.y,
          timestamp: Date.now(),
        });
        const scopeNote =
          scope === 'element'
            ? 'Note: this is an element-only screenshot; coordinates are relative to that element.'
            : scope === 'fullPage'
              ? 'Note: this is a full-page screenshot; coordinates are page-relative and may require scrolling.'
              : '';
        const scaleChanged = Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01;
        const scaleInfo = scaleChanged
          ? `\n\nIMPORTANT: This screenshot has been rescaled relative to the page CSS size.\nImage: ${Math.round(compressed.scaledWidth)}x${Math.round(compressed.scaledHeight)} px\nPage CSS: ${Math.round(compressed.originalWidth)}x${Math.round(compressed.originalHeight)} px\nConvert image coords → CSS coords: x_css = x_img / ${scaleX.toFixed(4)}, y_css = y_img / ${scaleY.toFixed(4)}.\nExample: (100, 200) → (${Math.round(100 / scaleX)}, ${Math.round(200 / scaleY)}).\nAlternatively, use chrome_get_interactive_elements to get accurate coordinates.`
          : '';
        const screenshotHint =
          '\nIf you pass coordinates from this screenshot to chrome_click_element, set fromScreenshot: true to auto-convert.';
        const scopeInfo = scopeNote ? `\n${scopeNote}` : '';

        return {
          content: [
            {
              type: 'image',
              data: base64Data,
              mimeType: compressed.mimeType,
            },
            {
              type: 'text',
              text: `Screenshot captured successfully.${scaleInfo}${screenshotHint}${scopeInfo}`,
            },
          ],
          isError: false,
        };
      }

      if (savePng === true) {
        // Save PNG file to downloads
        this.logInfo('Saving PNG...');
        try {
          // Generate filename
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `${name.replace(/[^a-z0-9_-]/gi, '_') || 'screenshot'}_${timestamp}.png`;

          // Use Chrome's download API to save the file
          const downloadId = await chrome.downloads.download({
            url: finalImageDataUrl,
            filename: filename,
            saveAs: false,
          });

          results.downloadId = downloadId;
          results.filename = filename;
          results.fileSaved = true;

          // Try to get the full file path
          try {
            // Wait a moment to ensure download info is updated
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Search for download item to get full path
            const [downloadItem] = await chrome.downloads.search({ id: downloadId });
            if (downloadItem && downloadItem.filename) {
              // Add full path to response
              results.fullPath = downloadItem.filename;
            }
          } catch (pathError) {
            console.warn('Could not get full file path:', pathError);
          }
        } catch (error) {
          console.error('Error saving PNG file:', error);
          results.saveError = String(error instanceof Error ? error.message : error);
        }
      }
    } catch (error) {
      console.error('Error during screenshot execution:', error);
      return createErrorResponse(
        `Screenshot error: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      );
    } finally {
      // 3. Reset page
      try {
        await this.sendMessageToTab(tab.id!, {
          action: TOOL_MESSAGE_TYPES.SCREENSHOT_RESET_PAGE_AFTER_CAPTURE,
          scrollX: originalScroll.x,
          scrollY: originalScroll.y,
        });
      } catch (err) {
        console.warn('Failed to reset page, tab might have closed:', err);
      }
    }

    this.logInfo('Screenshot completed!');

    // Build readable response for savePng case
    const parts: string[] = [];
    parts.push(`Screenshot "${name}" captured successfully`);
    if (results.filename) parts.push(`Filename: ${results.filename}`);
    if (results.fullPath) parts.push(`Path: ${results.fullPath}`);
    if (results.downloadId) parts.push(`Download ID: ${results.downloadId}`);
    if (tab.url) parts.push(`URL: ${tab.url}`);
    if (results.saveError) parts.push(`Warning: ${results.saveError}`);

    return {
      content: [
        {
          type: 'text',
          text: parts.join('\n'),
        },
      ],
      isError: false,
    };
  }

  /**
   * Log information
   */
  private logInfo(message: string) {
    console.log(`[Screenshot Tool] ${message}`);
  }

  /**
   * Capture specific element
   */
  async _captureElement(
    tabId: number,
    options: ScreenshotToolParams,
    pageDpr: number,
  ): Promise<{
    dataUrl: string;
    cssWidth: number;
    cssHeight: number;
    elementRect: { x: number; y: number; width: number; height: number };
    elementScroll: { x: number; y: number };
  }> {
    const elementDetails = await this.sendMessageToTab(tabId, {
      action: TOOL_MESSAGE_TYPES.SCREENSHOT_GET_ELEMENT_DETAILS,
      selector: options.selector,
    });

    const dpr = elementDetails.devicePixelRatio || pageDpr || 1;

    // Element rect is viewport-relative, in CSS pixels
    // captureVisibleTab captures in physical pixels
    const cropRectPx = {
      x: elementDetails.rect.x * dpr,
      y: elementDetails.rect.y * dpr,
      width: elementDetails.rect.width * dpr,
      height: elementDetails.rect.height * dpr,
    };

    // Small delay to ensure element is fully rendered after scrollIntoView
    await new Promise((resolve) => setTimeout(resolve, SCREENSHOT_CONSTANTS.SCRIPT_INIT_DELAY));

    const visibleCaptureDataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
    if (!visibleCaptureDataUrl) {
      throw new Error('Failed to capture visible tab for element cropping');
    }

    const croppedCanvas = await cropAndResizeImage(
      visibleCaptureDataUrl,
      cropRectPx,
      dpr,
      options.width, // Target output width in CSS pixels
      options.height, // Target output height in CSS pixels
    );
    const dataUrl = await canvasToDataURL(croppedCanvas);
    const cssWidth =
      typeof options.width === 'number' && Number.isFinite(options.width)
        ? options.width
        : elementDetails.rect.width;
    const cssHeight =
      typeof options.height === 'number' && Number.isFinite(options.height)
        ? options.height
        : elementDetails.rect.height;
    return {
      dataUrl,
      cssWidth,
      cssHeight,
      elementRect: elementDetails.rect,
      elementScroll: { x: elementDetails.scrollX || 0, y: elementDetails.scrollY || 0 },
    };
  }

  /**
   * Capture full page
   */
  async _captureFullPage(
    tabId: number,
    options: ScreenshotToolParams,
    initialPageDetails: any,
  ): Promise<{ dataUrl: string; cssWidth: number; cssHeight: number }> {
    const dpr = initialPageDetails.devicePixelRatio;
    const totalWidthCss = options.width || initialPageDetails.totalWidth; // Use option width if provided
    const totalHeightCss = initialPageDetails.totalHeight; // Full page always uses actual height

    // Apply maximum height limit for infinite scroll pages
    const maxHeightPx = options.maxHeight || SCREENSHOT_CONSTANTS.MAX_CAPTURE_HEIGHT_PX;
    const limitedHeightCss = Math.min(totalHeightCss, maxHeightPx / dpr);

    const totalWidthPx = totalWidthCss * dpr;
    const totalHeightPx = limitedHeightCss * dpr;

    // Viewport dimensions (CSS pixels) - logged for debugging
    this.logInfo(
      `Viewport size: ${initialPageDetails.viewportWidth}x${initialPageDetails.viewportHeight} CSS pixels`,
    );
    this.logInfo(
      `Page dimensions: ${totalWidthCss}x${totalHeightCss} CSS pixels (limited to ${limitedHeightCss} height)`,
    );

    const viewportHeightCss = initialPageDetails.viewportHeight;

    const capturedParts = [];
    let currentScrollYCss = 0;
    let capturedHeightPx = 0;
    let partIndex = 0;

    while (capturedHeightPx < totalHeightPx && partIndex < SCREENSHOT_CONSTANTS.MAX_CAPTURE_PARTS) {
      this.logInfo(
        `Capturing part ${partIndex + 1}... (${Math.round((capturedHeightPx / totalHeightPx) * 100)}%)`,
      );

      if (currentScrollYCss > 0) {
        // Don't scroll for the first part if already at top
        const scrollResp = await this.sendMessageToTab(tabId, {
          action: TOOL_MESSAGE_TYPES.SCREENSHOT_SCROLL_PAGE,
          x: 0,
          y: currentScrollYCss,
          scrollDelay: SCREENSHOT_CONSTANTS.SCROLL_DELAY_MS,
        });
        // Update currentScrollYCss based on actual scroll achieved
        currentScrollYCss = scrollResp.newScrollY;
      }

      // Ensure rendering after scroll
      await new Promise((resolve) =>
        setTimeout(resolve, SCREENSHOT_CONSTANTS.CAPTURE_STITCH_DELAY_MS),
      );

      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
      if (!dataUrl) throw new Error('captureVisibleTab returned empty during full page capture');

      const yOffsetPx = currentScrollYCss * dpr;
      capturedParts.push({ dataUrl, y: yOffsetPx });

      const imgForHeight = await createImageBitmapFromUrl(dataUrl); // To get actual captured height
      const lastPartEffectiveHeightPx = Math.min(imgForHeight.height, totalHeightPx - yOffsetPx);

      capturedHeightPx = yOffsetPx + lastPartEffectiveHeightPx;

      if (capturedHeightPx >= totalHeightPx - SCREENSHOT_CONSTANTS.PIXEL_TOLERANCE) break;

      currentScrollYCss += viewportHeightCss;
      // Prevent overscrolling past the document height for the next scroll command
      if (
        currentScrollYCss > totalHeightCss - viewportHeightCss &&
        currentScrollYCss < totalHeightCss
      ) {
        currentScrollYCss = totalHeightCss - viewportHeightCss;
      }
      partIndex++;
    }

    // Check if we hit any limits
    if (partIndex >= SCREENSHOT_CONSTANTS.MAX_CAPTURE_PARTS) {
      this.logInfo(
        `Reached maximum number of capture parts (${SCREENSHOT_CONSTANTS.MAX_CAPTURE_PARTS}). This may be an infinite scroll page.`,
      );
    }
    if (totalHeightCss > limitedHeightCss) {
      this.logInfo(
        `Page height (${totalHeightCss}px) exceeds maximum capture height (${maxHeightPx / dpr}px). Capturing limited portion.`,
      );
    }

    this.logInfo('Stitching image...');
    const finalCanvas = await stitchImages(capturedParts, totalWidthPx, totalHeightPx);

    // If user specified width but not height (or vice versa for full page), resize maintaining aspect ratio
    let outputCanvas = finalCanvas;
    if (options.width && !options.height) {
      const targetWidthPx = options.width * dpr;
      const aspectRatio = finalCanvas.height / finalCanvas.width;
      const targetHeightPx = targetWidthPx * aspectRatio;
      outputCanvas = new OffscreenCanvas(targetWidthPx, targetHeightPx);
      const ctx = outputCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(finalCanvas, 0, 0, targetWidthPx, targetHeightPx);
      }
    } else if (options.height && !options.width) {
      const targetHeightPx = options.height * dpr;
      const aspectRatio = finalCanvas.width / finalCanvas.height;
      const targetWidthPx = targetHeightPx * aspectRatio;
      outputCanvas = new OffscreenCanvas(targetWidthPx, targetHeightPx);
      const ctx = outputCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(finalCanvas, 0, 0, targetWidthPx, targetHeightPx);
      }
    } else if (options.width && options.height) {
      // Both specified, direct resize
      const targetWidthPx = options.width * dpr;
      const targetHeightPx = options.height * dpr;
      outputCanvas = new OffscreenCanvas(targetWidthPx, targetHeightPx);
      const ctx = outputCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(finalCanvas, 0, 0, targetWidthPx, targetHeightPx);
      }
    }

    const dataUrl = await canvasToDataURL(outputCanvas);
    let cssWidth: number;
    let cssHeight: number;
    if (options.width && !options.height) {
      cssWidth = options.width;
      cssHeight = options.width * (limitedHeightCss / totalWidthCss);
    } else if (options.height && !options.width) {
      cssHeight = options.height;
      cssWidth = options.height * (totalWidthCss / limitedHeightCss);
    } else if (options.width && options.height) {
      cssWidth = options.width;
      cssHeight = options.height;
    } else {
      cssWidth = totalWidthCss;
      cssHeight = limitedHeightCss;
    }

    return { dataUrl, cssWidth, cssHeight };
  }
}

export const screenshotTool = new ScreenshotTool();
