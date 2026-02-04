import { create } from "zustand";
import type {
  GlobalConfig,
  GitHubConfig,
  LinearConfig,
  LinearUser,
} from "../types";

interface SettingsState {
  globalConfig: GlobalConfig | null;
  gitHubConfig: GitHubConfig | null;
  linearConfig: LinearConfig | null;
  isLoading: boolean;
  isInitialized: boolean;

  initialize: () => Promise<void>;

  connectGitHub: (token: string) => Promise<{ success: boolean; error?: string }>;
  disconnectGitHub: () => Promise<void>;
  isGitHubConnected: () => boolean;

  connectLinear: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  disconnectLinear: () => Promise<void>;
  isLinearConnected: () => boolean;

  updateGlobalConfig: (updates: Partial<GlobalConfig>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  globalConfig: null,
  gitHubConfig: null,
  linearConfig: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    if (get().isInitialized) return;

    set({ isLoading: true });
    try {
      const [globalConfig, gitHubConfig, linearConfig] = await Promise.all([
        window.api.config.getGlobal(),
        window.api.config.getGitHub(),
        window.api.config.getLinear(),
      ]);
      set({
        globalConfig,
        gitHubConfig,
        linearConfig,
        isInitialized: true,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  connectGitHub: async (token: string) => {
    set({ isLoading: true });
    try {
      const result = await window.api.github.validate(token);
      if (!result.valid || !result.username) {
        return { success: false, error: result.error || "Invalid token" };
      }

      const config: GitHubConfig = {
        token,
        username: result.username,
        validatedAt: Date.now(),
      };
      await window.api.config.saveGitHub(config);
      set({ gitHubConfig: config });

      return { success: true };
    } catch (err) {
      const error = err as Error;
      return { success: false, error: error.message };
    } finally {
      set({ isLoading: false });
    }
  },

  disconnectGitHub: async () => {
    await window.api.config.clearGitHub();
    set({ gitHubConfig: null });
  },

  isGitHubConnected: () => get().gitHubConfig !== null,

  connectLinear: async (apiKey: string) => {
    set({ isLoading: true });
    try {
      const result = await window.api.linear.validate(apiKey);
      if (!result.valid || !result.user) {
        return { success: false, error: result.error || "Invalid API key" };
      }

      const user = result.user as LinearUser;
      const config: LinearConfig = {
        apiKey,
        userId: user.id,
        userName: user.displayName,
        validatedAt: Date.now(),
      };
      await window.api.config.saveLinear(config);
      set({ linearConfig: config });

      return { success: true };
    } catch (err) {
      const error = err as Error;
      return { success: false, error: error.message };
    } finally {
      set({ isLoading: false });
    }
  },

  disconnectLinear: async () => {
    await window.api.config.clearLinear();
    set({ linearConfig: null });
  },

  isLinearConnected: () => get().linearConfig !== null,

  updateGlobalConfig: async (updates: Partial<GlobalConfig>) => {
    const { globalConfig } = get();
    if (!globalConfig) return;

    const newConfig = { ...globalConfig, ...updates };
    await window.api.config.saveGlobal(newConfig);
    set({ globalConfig: newConfig });
  },
}));
