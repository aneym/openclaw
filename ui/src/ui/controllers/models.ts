import type { ModelCatalogEntry } from "../ui-types";

export type ModelsState = {
  client: { request: (method: string, params?: unknown) => Promise<unknown> } | null;
  connected: boolean;
  modelsLoading: boolean;
  modelsList: ModelCatalogEntry[];
  modelsError: string | null;
};

export async function loadModels(state: ModelsState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.modelsLoading) {
    return;
  }
  state.modelsLoading = true;
  try {
    const res = await state.client.request("models.list", {});
    const payload = res as { models?: unknown[] } | undefined;
    const models = Array.isArray(payload?.models) ? payload.models : [];
    state.modelsList = models as ModelCatalogEntry[];
    state.modelsError = null;
  } catch (err) {
    state.modelsError = String(err);
  } finally {
    state.modelsLoading = false;
  }
}
