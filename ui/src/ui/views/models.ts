import { html, nothing } from "lit";

export type ModelsProps = {
  providers: ModelProvider[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  connected: boolean;
  // Default model selection
  defaultModel?: string | null;
  onSetDefaultModel?: (modelRef: string) => void;
  // Model visibility in picker
  visibleModels?: string[];
  onToggleModelVisibility?: (modelRef: string, visible: boolean) => void;
  onAddProvider: (provider: ModelProvider) => void;
  onRemoveProvider: (name: string) => void;
  onSave: () => void;
  onReload: () => void;
};

export type ModelProvider = {
  name: string;
  baseUrl: string;
  apiKey: string;
  api?: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai" | "github-copilot" | "bedrock-converse-stream";
  auth?: "api-key" | "aws-sdk" | "oauth" | "token";
  headers?: Record<string, string>;
  authHeader?: boolean;
  models: ModelDefinition[];
  isImplicit?: boolean;
};

export type ModelDefinition = {
  id: string;
  name: string;
  api?: "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai" | "github-copilot" | "bedrock-converse-stream";
  reasoning?: boolean;
  input?: Array<"text" | "image">;
  contextWindow?: number;
  maxTokens?: number;
  cost?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  headers?: Record<string, string>;
  compat?: {
    supportsStore?: boolean;
    supportsDeveloperRole?: boolean;
    supportsReasoningEffort?: boolean;
    maxTokensField?: "max_completion_tokens" | "max_tokens";
  };
};

export function renderModels(props: ModelsProps) {
  if (props.loading) {
    return html`
      <div class="models-page">
        <div class="models-loading">
          <span class="spinner"></span>
          <span>Loading model configuration...</span>
        </div>
      </div>
    `;
  }

  return html`
    <div class="models-page">
      <div class="models-header">
        <div>
          <h2>Model Providers</h2>
          <p class="models-subtitle">
            Configure AI providers and models for your agents.
          </p>
        </div>
        <div class="models-actions">
          <button
            class="btn btn--secondary"
            ?disabled=${props.saving || !props.connected}
            @click=${() => props.onReload()}
          >
            Refresh
          </button>
          <button
            class="btn btn--primary"
            ?disabled=${props.saving || !props.connected}
            @click=${() => props.onSave()}
          >
            ${props.saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      ${props.error
        ? html`<div class="callout danger">${props.error}</div>`
        : nothing}

      <div class="providers-list">
        ${props.providers.length === 0
          ? html`
              <div class="empty-state">
                <p>No model providers configured.</p>
                <p class="empty-hint">
                  Add a provider below to enable AI models in your agents.
                </p>
              </div>
            `
          : props.providers.map(
              (provider) => html`
                <div class="provider-card ${provider.isImplicit ? 'provider-card--implicit' : ''}">
                  <div class="provider-header">
                    <div class="provider-info">
                      <h3 class="provider-name">
                        ${provider.name}
                        ${provider.isImplicit
                          ? html`<span class="provider-badge">from auth</span>`
                          : nothing}
                      </h3>
                      ${!provider.isImplicit
                        ? html`<span class="provider-url">${provider.baseUrl}</span>`
                        : html`<span class="provider-url">Configured via auth profiles</span>`}
                    </div>
                    ${!provider.isImplicit
                      ? html`<button
                          class="btn btn--sm btn--danger"
                          @click=${() => props.onRemoveProvider(provider.name)}
                        >
                          Remove
                        </button>`
                      : nothing}
                  </div>

                  ${!provider.isImplicit
                    ? html`<div class="provider-fields">
                        <label class="field">
                          <span>API Key</span>
                          <input
                            type="password"
                            .value=${provider.apiKey}
                            placeholder="sk-..."
                            readonly
                          />
                        </label>
                      </div>`
                    : nothing}

                  <div class="models-section">
                    <h4>Models</h4>
                    <div class="models-list">
                      ${provider.models.map(
                        (model) => {
                          const modelRef = `${provider.name}/${model.id}`;
                          return html`
                          <div class="model-item">
                            <div class="model-main">
                              <span class="model-name">${model.name}</span>
                              <span class="model-id">${model.id}</span>
                              <span class="model-badge">${model.api ?? "openai-completions"}</span>
                              ${model.reasoning
                                ? html`<span class="model-badge badge-reasoning"
                                    >reasoning</span
                                  >`
                                : nothing}
                              ${model.input?.includes("image")
                                ? html`<span class="model-badge badge-vision"
                                    >vision</span
                                  >`
                                : nothing}
                            </div>
                            <div class="model-meta">
                              ${model.contextWindow
                                ? html`<span class="model-meta-item"
                                    >${(model.contextWindow / 1000).toFixed(0)}k ctx</span
                                  >`
                                : nothing}
                              ${model.maxTokens
                                ? html`<span class="model-meta-item"
                                    >${(model.maxTokens / 1000).toFixed(0)}k max</span
                                  >`
                                : nothing}
                              ${model.cost?.input
                                ? html`<span class="model-meta-item cost"
                                    >$${(model.cost.input / 1_000_000).toFixed(2)}/1M in</span
                                  >`
                                : nothing}
                            </div>
                            ${props.onSetDefaultModel || props.onToggleModelVisibility
                              ? html`<div class="model-actions">
                                  ${props.onSetDefaultModel
                                    ? html`<label class="model-toggle">
                                        <input
                                          type="radio"
                                          name="default-model"
                                          .checked=${props.defaultModel === modelRef}
                                          @change=${() => props.onSetDefaultModel!(modelRef)}
                                          title="Set as default model"
                                        />
                                        <span>Default</span>
                                      </label>`
                                    : nothing}
                                  ${props.onToggleModelVisibility
                                    ? html`<label class="model-toggle">
                                        <input
                                          type="checkbox"
                                          .checked=${(props.visibleModels ?? []).includes(modelRef)}
                                          @change=${(e: Event) => {
                                            const checked = (e.target as HTMLInputElement).checked;
                                            props.onToggleModelVisibility!(modelRef, checked);
                                          }}
                                          title="Show in model picker"
                                        />
                                        <span>In picker</span>
                                      </label>`
                                    : nothing}
                                </div>`
                              : nothing}
                          </div>
                        `}
                      )}
                    </div>
                  </div>
                </div>
              `
            )}
      </div>

      <div class="add-provider-section">
        <h3>Add Provider</h3>
        <form
          class="add-provider-form"
          @submit=${(e: SubmitEvent) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const formData = new FormData(form);
            const name = String(formData.get("name") ?? "").trim();
            const baseUrl = String(formData.get("baseUrl") ?? "").trim();
            const apiKey = String(formData.get("apiKey") ?? "").trim();
            const modelId = String(formData.get("modelId") ?? "").trim();
            const modelName = String(formData.get("modelName") ?? "").trim();

            if (name && baseUrl && apiKey && modelId) {
              props.onAddProvider({
                name,
                baseUrl,
                apiKey,
                models: [
                  {
                    id: modelId,
                    name: modelName || modelId,
                    api: "openai-completions",
                    reasoning: false,
                    input: ["text"],
                    contextWindow: 128000,
                    maxTokens: 4096,
                    cost: {
                      input: 0,
                      output: 0,
                      cacheRead: 0,
                      cacheWrite: 0,
                    },
                  },
                ],
              });
              form.reset();
            }
          }}
        >
          <div class="form-row">
            <label class="field">
              <span>Provider Name</span>
              <input
                name="name"
                type="text"
                placeholder="moonshot"
                required
              />
            </label>
            <label class="field">
              <span>Base URL</span>
              <input
                name="baseUrl"
                type="url"
                placeholder="https://api.moonshot.cn/v1"
                required
              />
            </label>
          </div>
          <div class="form-row">
            <label class="field">
              <span>API Key</span>
              <input
                name="apiKey"
                type="password"
                placeholder="sk-..."
                required
              />
            </label>
            <label class="field">
              <span>Default Model ID</span>
              <input
                name="modelId"
                type="text"
                placeholder="kimi-k2.5"
                required
              />
            </label>
          </div>
          <div class="form-row">
            <label class="field">
              <span>Model Display Name (optional)</span>
              <input
                name="modelName"
                type="text"
                placeholder="Kimi 2.5"
              />
            </label>
          </div>
          <button type="submit" class="btn btn--primary" ?disabled=${!props.connected}>
            Add Provider
          </button>
        </form>
      </div>

      <div class="models-help">
        <h4>Quick Start</h4>
        <p>To use Kimi 2.5 from Moonshot:</p>
        <ul>
          <li>Provider Name: <code>moonshot</code></li>
          <li>Base URL: <code>https://api.moonshot.cn/v1</code></li>
          <li>API Key: Your Moonshot API key (get from platform.moonshot.cn)</li>
          <li>Model ID: <code>kimi-k2.5</code></li>
        </ul>
      </div>
    </div>
  `;
}
