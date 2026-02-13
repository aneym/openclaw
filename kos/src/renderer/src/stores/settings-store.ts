import { create } from "zustand";
import type { GlobalConfig, GitHubConfig, LinearConfig, LinearUser } from "../types";
import { getRendererApi, getRuntimeCapabilities } from "../lib/runtime";
import { DEFAULT_GATEWAY_URL } from "../types/profile";

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  version: 1,
  defaultGatewayUrl: DEFAULT_GATEWAY_URL,
  theme: "dark",
  sidebarWidth: 280,
};

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
    if (get().isInitialized) {
      return;
    }

    set({ isLoading: true });
    try {
      const caps = getRuntimeCapabilities();
      if (!caps.hasSettingsApi) {
        set({
          globalConfig: DEFAULT_GLOBAL_CONFIG,
          gitHubConfig: null,
          linearConfig: null,
          isInitialized: true,
        });
        return;
      }

      const api = getRendererApi();
      if (!api) {
        set({
          globalConfig: DEFAULT_GLOBAL_CONFIG,
          gitHubConfig: null,
          linearConfig: null,
          isInitialized: true,
        });
        return;
      }

      const [globalConfig, gitHubConfig, linearConfig] = await Promise.all([
        api.config.getGlobal(),
        api.config.getGitHub(),
        api.config.getLinear(),
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
      const caps = getRuntimeCapabilities();
      if (!caps.hasGitHubApi || !caps.hasSettingsApi) {
        return {
          success: false,
          error: "GitHub integration is only available in the desktop app",
        };
      }

      const api = getRendererApi();
      if (!api) {
        return {
          success: false,
          error: "GitHub integration bridge is unavailable",
        };
      }

      const result = await api.github.validate(token);
      if (!result.valid || !result.username) {
        return { success: false, error: result.error || "Invalid token" };
      }

      const config: GitHubConfig = {
        token,
        username: result.username,
        validatedAt: Date.now(),
      };
      await api.config.saveGitHub(config);
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
    const api = getRendererApi();
    if (api?.config) {
      await api.config.clearGitHub();
    }
    set({ gitHubConfig: null });
  },

  isGitHubConnected: () => get().gitHubConfig !== null,

  connectLinear: async (apiKey: string) => {
    set({ isLoading: true });
    try {
      const caps = getRuntimeCapabilities();
      if (!caps.hasLinearApi || !caps.hasSettingsApi) {
        return {
          success: false,
          error: "Linear integration is only available in the desktop app",
        };
      }

      const api = getRendererApi();
      if (!api) {
        return {
          success: false,
          error: "Linear integration bridge is unavailable",
        };
      }

      const result = await api.linear.validate(apiKey);
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
      await api.config.saveLinear(config);
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
    const api = getRendererApi();
    if (api?.config) {
      await api.config.clearLinear();
    }
    set({ linearConfig: null });
  },

  isLinearConnected: () => get().linearConfig !== null,

  updateGlobalConfig: async (updates: Partial<GlobalConfig>) => {
    const { globalConfig } = get();
    if (!globalConfig) {
      return;
    }

    const newConfig = { ...globalConfig, ...updates };
    const api = getRendererApi();
    if (api?.config) {
      await api.config.saveGlobal(newConfig);
    }
    set({ globalConfig: newConfig });
  },
}));
