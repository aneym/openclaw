import type { PanelType } from "../types";

type RuntimeWindow = Window & {
  api?: Window["api"];
  electron?: Window["electron"];
};

export type RuntimeEnvironment = "electron" | "browser";

export interface RuntimeCapabilities {
  environment: RuntimeEnvironment;
  hasBridge: boolean;
  hasNativeDialogs: boolean;
  hasProjectApi: boolean;
  hasSettingsApi: boolean;
  hasGitApi: boolean;
  hasGitHubApi: boolean;
  hasLinearApi: boolean;
  hasTerminal: boolean;
  hasBrowserPanel: boolean;
}

function getRuntimeWindow(): RuntimeWindow | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window as RuntimeWindow;
}

export function getRendererApi(): Window["api"] | undefined {
  return getRuntimeWindow()?.api;
}

export function getRuntimeEnvironment(): RuntimeEnvironment {
  return getRendererApi() ? "electron" : "browser";
}

export function getRuntimeCapabilities(): RuntimeCapabilities {
  const api = getRendererApi();
  return {
    environment: getRuntimeEnvironment(),
    hasBridge: Boolean(api),
    hasNativeDialogs: Boolean(api?.openDirectoryDialog),
    hasProjectApi: Boolean(api?.projects),
    hasSettingsApi: Boolean(api?.config),
    hasGitApi: Boolean(api?.git),
    hasGitHubApi: Boolean(api?.github),
    hasLinearApi: Boolean(api?.linear),
    hasTerminal: Boolean(api?.terminal),
    hasBrowserPanel: Boolean(api?.browser),
  };
}

export function supportsPanelType(type: PanelType): boolean {
  const caps = getRuntimeCapabilities();
  switch (type) {
    case "terminal":
      return caps.hasTerminal;
    case "browser":
      return caps.hasBrowserPanel;
    default:
      return true;
  }
}

export function getSupportedUserPanelTypes(panelTypes: readonly PanelType[]): PanelType[] {
  return panelTypes.filter((type) => supportsPanelType(type));
}
