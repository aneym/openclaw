/**
 * kOS Native Addon - iOS Simulator capture via ScreenCaptureKit
 */

export interface SimulatorWindow {
  /** Window ID */
  windowId: number;
  /** Process ID */
  pid: number;
  /** Window title */
  title: string;
  /** Bundle identifier (e.g., "com.apple.iphonesimulator") */
  bundleId: string;
  /** Window bounds */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface CaptureConfig {
  /** Target frames per second (default: 60) */
  fps?: number;
  /** Pixel format: 'bgra' | 'rgba' (default: 'bgra') */
  pixelFormat?: "bgra" | "rgba";
  /** Scale factor for capture (default: 1.0) */
  scaleFactor?: number;
  /** Show cursor in capture (default: false) */
  showCursor?: boolean;
}

export interface FrameData {
  /** Raw pixel buffer (BGRA or RGBA format) */
  buffer: Buffer;
  /** Frame width in pixels */
  width: number;
  /** Frame height in pixels */
  height: number;
  /** Timestamp of frame capture */
  timestamp: number;
  /** Bytes per row (may include padding) */
  bytesPerRow: number;
}

export type FrameCallback = (frame: FrameData) => void;
export type ErrorCallback = (error: Error) => void;

/**
 * List all available iOS Simulator windows
 */
export function listSimulatorWindows(): Promise<SimulatorWindow[]>;

/**
 * Start capturing frames from a Simulator window
 * @param windowId - The window ID to capture
 * @param config - Capture configuration
 * @param onFrame - Callback for each captured frame
 * @param onError - Callback for errors
 * @returns Stop function to end capture
 */
export function startCapture(
  windowId: number,
  config: CaptureConfig,
  onFrame: FrameCallback,
  onError: ErrorCallback,
): Promise<() => void>;

/**
 * Inject a tap event at the specified coordinates relative to window
 * @param windowId - Target window ID
 * @param x - X coordinate relative to window
 * @param y - Y coordinate relative to window
 */
export function injectTap(windowId: number, x: number, y: number): void;

/**
 * Inject a swipe gesture
 * @param windowId - Target window ID
 * @param startX - Start X coordinate
 * @param startY - Start Y coordinate
 * @param endX - End X coordinate
 * @param endY - End Y coordinate
 * @param durationMs - Duration of swipe in milliseconds
 */
export function injectSwipe(
  windowId: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  durationMs: number,
): void;

/**
 * Inject keyboard input
 * @param windowId - Target window ID
 * @param text - Text to type
 */
export function injectText(windowId: number, text: string): void;

/**
 * Check if Screen Recording permission is granted
 */
export function hasScreenRecordingPermission(): boolean;

/**
 * Request Screen Recording permission (opens System Preferences)
 */
export function requestScreenRecordingPermission(): void;

/**
 * Check if Accessibility permission is granted
 */
export function hasAccessibilityPermission(): boolean;

/**
 * Request Accessibility permission (opens System Preferences)
 */
export function requestAccessibilityPermission(): void;
