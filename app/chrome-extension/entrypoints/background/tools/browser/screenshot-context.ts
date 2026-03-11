export type ScreenshotScope = 'viewport' | 'element' | 'fullPage';
export type ScreenshotCoordinateSpace = 'css_pixels' | 'screenshot_pixels_scaled';

export type ScreenshotContext = {
  scope: ScreenshotScope;
  coordinateSpace: ScreenshotCoordinateSpace;
  scaleX: number;
  scaleY: number;
  cssWidth: number;
  cssHeight: number;
  scaledWidth: number;
  scaledHeight: number;
  scrollX: number;
  scrollY: number;
  elementRect?: { x: number; y: number; width: number; height: number };
  elementScrollX?: number;
  elementScrollY?: number;
  timestamp: number;
};

const contextByTab = new Map<number, ScreenshotContext>();

export function setLastScreenshotContext(tabId: number, context: ScreenshotContext) {
  contextByTab.set(tabId, context);
}

export function getLastScreenshotContext(tabId: number): ScreenshotContext | undefined {
  return contextByTab.get(tabId);
}
