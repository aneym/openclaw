import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SimulatorWindow, SimulatorFrame } from "../../../preload/index.d";

interface SimulatorState {
  // Persisted state
  lastWindowId: number | null;
  fps: number;
  scaleFactor: number;

  // Runtime state
  windows: SimulatorWindow[];
  activeWindowId: number | null;
  capturing: boolean;
  hasScreenPermission: boolean;
  hasAccessibilityPermission: boolean;
  error: string | null;
  lastFrame: SimulatorFrame | null;
  frameCount: number;

  // Actions
  setFps: (fps: number) => void;
  setScaleFactor: (scale: number) => void;
  refreshWindows: () => Promise<void>;
  checkPermissions: () => Promise<void>;
  requestScreenPermission: () => Promise<void>;
  requestAccessibilityPermission: () => Promise<void>;
  startCapture: (windowId: number) => Promise<boolean>;
  stopCapture: () => Promise<void>;
  injectTap: (x: number, y: number) => void;
  injectSwipe: (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    durationMs?: number,
  ) => void;
  injectText: (text: string) => void;
  setFrame: (windowId: number, frame: SimulatorFrame) => void;
  setError: (windowId: number, error: string) => void;
}

export const useSimulatorStore = create<SimulatorState>()(
  persist(
    (set, get) => ({
      // Persisted defaults
      lastWindowId: null,
      fps: 30,
      scaleFactor: 1.0,

      // Runtime defaults
      windows: [],
      activeWindowId: null,
      capturing: false,
      hasScreenPermission: false,
      hasAccessibilityPermission: false,
      error: null,
      lastFrame: null,
      frameCount: 0,

      setFps: (fps) => set({ fps }),
      setScaleFactor: (scaleFactor) => set({ scaleFactor }),

      refreshWindows: async () => {
        try {
          const windows = await window.api.simulator.listWindows();
          set({ windows, error: null });
        } catch (err) {
          set({ error: String(err) });
        }
      },

      checkPermissions: async () => {
        const [hasScreenPermission, hasAccessibilityPermission] = await Promise.all([
          window.api.simulator.hasScreenPermission(),
          window.api.simulator.hasAccessibilityPermission(),
        ]);
        set({ hasScreenPermission, hasAccessibilityPermission });
      },

      requestScreenPermission: async () => {
        await window.api.simulator.requestScreenPermission();
        // User needs to manually grant permission in System Settings
        // Recheck after a delay
        setTimeout(() => get().checkPermissions(), 1000);
      },

      requestAccessibilityPermission: async () => {
        await window.api.simulator.requestAccessibilityPermission();
        // User needs to manually grant permission in System Settings
        setTimeout(() => get().checkPermissions(), 1000);
      },

      startCapture: async (windowId) => {
        const { fps, scaleFactor } = get();

        // Stop any existing capture first
        await get().stopCapture();

        const result = await window.api.simulator.startCapture(windowId, {
          fps,
          scaleFactor,
        });

        if (result.success) {
          set({
            activeWindowId: windowId,
            lastWindowId: windowId,
            capturing: true,
            error: null,
            frameCount: 0,
          });
          return true;
        } else {
          set({ error: result.error || "Failed to start capture" });
          return false;
        }
      },

      stopCapture: async () => {
        const { activeWindowId } = get();
        if (activeWindowId !== null) {
          await window.api.simulator.stopCapture(activeWindowId);
        }
        set({ activeWindowId: null, capturing: false, lastFrame: null });
      },

      injectTap: (x, y) => {
        const { activeWindowId } = get();
        if (activeWindowId !== null) {
          window.api.simulator.injectTap(activeWindowId, x, y);
        }
      },

      injectSwipe: (startX, startY, endX, endY, durationMs = 300) => {
        const { activeWindowId } = get();
        if (activeWindowId !== null) {
          window.api.simulator.injectSwipe(activeWindowId, startX, startY, endX, endY, durationMs);
        }
      },

      injectText: (text) => {
        const { activeWindowId } = get();
        if (activeWindowId !== null) {
          window.api.simulator.injectText(activeWindowId, text);
        }
      },

      setFrame: (windowId, frame) => {
        const { activeWindowId } = get();
        if (windowId === activeWindowId) {
          set((state) => ({
            lastFrame: frame,
            frameCount: state.frameCount + 1,
          }));
        }
      },

      setError: (windowId, error) => {
        const { activeWindowId } = get();
        if (windowId === activeWindowId) {
          set({ error, capturing: false });
        }
      },
    }),
    {
      name: "kos-simulator",
      partialize: (state) => ({
        lastWindowId: state.lastWindowId,
        fps: state.fps,
        scaleFactor: state.scaleFactor,
      }),
    },
  ),
);

// Initialize frame listener when module loads
if (typeof window !== "undefined" && window.api?.simulator) {
  window.api.simulator.onFrame((windowId, frame) => {
    useSimulatorStore.getState().setFrame(windowId, frame);
  });

  window.api.simulator.onError((windowId, error) => {
    useSimulatorStore.getState().setError(windowId, error);
  });
}
