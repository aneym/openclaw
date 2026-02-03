import { ElectronAPI } from "@electron-toolkit/preload";

export interface SimulatorWindow {
  windowId: number;
  pid: number;
  title: string;
  bundleId: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface SimulatorFrame {
  buffer: Buffer;
  width: number;
  height: number;
  bytesPerRow: number;
  timestamp: number;
}

export interface CaptureConfig {
  fps?: number;
  scaleFactor?: number;
}

export interface SimulatorAPI {
  listWindows: () => Promise<SimulatorWindow[]>;
  hasScreenPermission: () => Promise<boolean>;
  requestScreenPermission: () => Promise<void>;
  hasAccessibilityPermission: () => Promise<boolean>;
  requestAccessibilityPermission: () => Promise<void>;
  startCapture: (
    windowId: number,
    config: CaptureConfig,
  ) => Promise<{ success: boolean; error?: string }>;
  stopCapture: (windowId: number) => Promise<void>;
  injectTap: (windowId: number, x: number, y: number) => Promise<void>;
  injectSwipe: (
    windowId: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    durationMs: number,
  ) => Promise<void>;
  injectText: (windowId: number, text: string) => Promise<void>;
  onFrame: (callback: (windowId: number, frame: SimulatorFrame) => void) => () => void;
  onError: (callback: (windowId: number, error: string) => void) => () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      getGatewayConfig: () => Promise<{ url: string; token?: string }>;
      openDirectoryDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
      simulator: SimulatorAPI;
    };
  }
}

export {};
