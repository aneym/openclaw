import { html, nothing } from "lit";
import type { ChannelsStatusSnapshot, SkillStatusReport } from "../types";

export type ServicesProps = {
  connected: boolean;
  config: Record<string, unknown> | null;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  skillsReport: SkillStatusReport | null;
};

type CapabilityStatus = "enabled" | "disabled" | "scoped" | "escalate";

type Capability = {
  name: string;
  status: CapabilityStatus;
  detail?: string;
  configPath?: string;
};

type ServiceCard = {
  id: string;
  label: string;
  icon: string;
  category: "messaging" | "development" | "productivity" | "infrastructure";
  status: "connected" | "disconnected";
  capabilities: Capability[];
};

// Helper to safely get nested config value
function getConfigValue(config: Record<string, unknown> | null, path: string): unknown {
  if (!config) return null;
  const parts = path.split(".");
  let current: any = config;
  for (const part of parts) {
    if (current && typeof current === "object") {
      current = current[part];
    } else {
      return null;
    }
  }
  return current;
}

// Service derivation functions
function deriveWhatsApp(config: Record<string, unknown> | null): ServiceCard | null {
  const whatsapp = getConfigValue(config, "channels.whatsapp");
  if (!whatsapp || typeof whatsapp !== "object") {
    return null;
  }

  const wa = whatsapp as Record<string, unknown>;
  const capabilities: Capability[] = [];

  // Read messages - always enabled if channel exists
  capabilities.push({
    name: "Read messages",
    status: "enabled",
    detail: "All conversations",
  });

  // Send DMs
  const dmPolicy = wa.dmPolicy as string | undefined;
  const allowFrom = wa.allowFrom as string[] | undefined;
  if (dmPolicy === "deny") {
    capabilities.push({
      name: "Send DMs",
      status: "disabled",
      detail: "Policy: deny",
      configPath: "channels.whatsapp.dmPolicy",
    });
  } else if (dmPolicy === "allowlist" && allowFrom) {
    capabilities.push({
      name: "Send DMs",
      status: "scoped",
      detail: `Allowlist (${allowFrom.length} contacts)`,
      configPath: "channels.whatsapp.allowFrom",
    });
  } else {
    capabilities.push({
      name: "Send DMs",
      status: "enabled",
      detail: dmPolicy === "escalate" ? "Requires approval" : "Allowed",
      configPath: "channels.whatsapp.dmPolicy",
    });
  }

  // Send media
  const mediaMaxMb = wa.mediaMaxMb as number | undefined;
  capabilities.push({
    name: "Send media",
    status: "enabled",
    detail: mediaMaxMb ? `Max ${mediaMaxMb}MB` : "No size limit",
    configPath: "channels.whatsapp.mediaMaxMb",
  });

  // Group messages
  const groupPolicy = wa.groupPolicy as string | undefined;
  if (groupPolicy === "deny") {
    capabilities.push({
      name: "Group messages",
      status: "disabled",
      detail: "Policy: deny",
      configPath: "channels.whatsapp.groupPolicy",
    });
  } else if (groupPolicy === "escalate") {
    capabilities.push({
      name: "Group messages",
      status: "escalate",
      detail: "Requires approval",
      configPath: "channels.whatsapp.groupPolicy",
    });
  } else {
    capabilities.push({
      name: "Group messages",
      status: "enabled",
      detail: "Allowed",
      configPath: "channels.whatsapp.groupPolicy",
    });
  }

  // Self-chat
  const selfChatMode = wa.selfChatMode as string | undefined;
  if (selfChatMode === "off") {
    capabilities.push({
      name: "Self-chat",
      status: "disabled",
      configPath: "channels.whatsapp.selfChatMode",
    });
  } else {
    capabilities.push({
      name: "Self-chat",
      status: "enabled",
      detail: selfChatMode || "Enabled",
      configPath: "channels.whatsapp.selfChatMode",
    });
  }

  return {
    id: "whatsapp",
    label: "WhatsApp",
    icon: "💬",
    category: "messaging",
    status: "connected",
    capabilities,
  };
}

function deriveSlack(config: Record<string, unknown> | null): ServiceCard | null {
  const slack = getConfigValue(config, "channels.slack");
  if (!slack || typeof slack !== "object") {
    return null;
  }

  const slackCfg = slack as Record<string, unknown>;
  const capabilities: Capability[] = [];

  // Read messages - always enabled
  capabilities.push({
    name: "Read messages",
    status: "enabled",
    detail: "All channels",
  });

  // Send DMs
  const dm = slackCfg.dm as Record<string, unknown> | undefined;
  if (dm) {
    const dmPolicy = dm.policy as string | undefined;
    const dmAllowFrom = dm.allowFrom as string[] | undefined;
    
    if (dmPolicy === "deny") {
      capabilities.push({
        name: "Send DMs",
        status: "disabled",
        detail: "Policy: deny",
        configPath: "channels.slack.dm.policy",
      });
    } else if (dmPolicy === "allowlist" && dmAllowFrom) {
      const isWildcard = dmAllowFrom.length === 1 && dmAllowFrom[0] === "*";
      capabilities.push({
        name: "Send DMs",
        status: isWildcard ? "enabled" : "scoped",
        detail: isWildcard ? "All users" : `Allowlist (${dmAllowFrom.length} users)`,
        configPath: "channels.slack.dm.allowFrom",
      });
    } else {
      capabilities.push({
        name: "Send DMs",
        status: "enabled",
        detail: dmPolicy === "escalate" ? "Requires approval" : "Allowed",
        configPath: "channels.slack.dm.policy",
      });
    }
  } else {
    capabilities.push({
      name: "Send DMs",
      status: "enabled",
      detail: "Allowed",
    });
  }

  // Send to channels
  const channels = slackCfg.channels as Record<string, unknown> | undefined;
  if (channels) {
    const allowedChannels = Object.entries(channels).filter(
      ([_, cfg]) => typeof cfg === "object" && (cfg as any).allow === true
    );
    if (allowedChannels.length > 0) {
      capabilities.push({
        name: "Send to channels",
        status: "scoped",
        detail: `${allowedChannels.length} channels allowed`,
        configPath: "channels.slack.channels",
      });
    } else {
      capabilities.push({
        name: "Send to channels",
        status: "disabled",
        detail: "No channels configured",
        configPath: "channels.slack.channels",
      });
    }
  } else {
    capabilities.push({
      name: "Send to channels",
      status: "disabled",
      detail: "Not configured",
    });
  }

  // Reactions - always available
  capabilities.push({
    name: "Reactions",
    status: "enabled",
    detail: "Message tool",
  });

  return {
    id: "slack",
    label: "Slack",
    icon: "💼",
    category: "messaging",
    status: "connected",
    capabilities,
  };
}

function deriveBlueBubbles(config: Record<string, unknown> | null): ServiceCard | null {
  const bluebubbles = getConfigValue(config, "channels.bluebubbles");
  if (!bluebubbles || typeof bluebubbles !== "object") {
    return null;
  }

  const bb = bluebubbles as Record<string, unknown>;
  const capabilities: Capability[] = [];

  // Read messages
  const allowFrom = bb.allowFrom as string[] | undefined;
  if (allowFrom && allowFrom.length > 0) {
    capabilities.push({
      name: "Read messages",
      status: "scoped",
      detail: `Allowlist (${allowFrom.length} contacts)`,
      configPath: "channels.bluebubbles.allowFrom",
    });
  } else {
    capabilities.push({
      name: "Read messages",
      status: "enabled",
      detail: "All conversations",
    });
  }

  // Send messages - check sendPolicy rules
  const sendPolicy = getConfigValue(config, "session.sendPolicy") as Record<string, unknown> | undefined;
  const rules = (sendPolicy?.rules ?? []) as Array<Record<string, unknown>>;
  const bbDenyRule = rules.find((rule) => {
    const match = rule.match as Record<string, unknown> | undefined;
    return match?.channel === "bluebubbles" && rule.action === "deny";
  });

  if (bbDenyRule) {
    capabilities.push({
      name: "Send messages",
      status: "disabled",
      detail: "Blocked by sendPolicy",
      configPath: "session.sendPolicy.rules",
    });
  } else {
    capabilities.push({
      name: "Send messages",
      status: "enabled",
      detail: "Allowed",
    });
  }

  return {
    id: "imessage",
    label: "iMessage",
    icon: "💬",
    category: "messaging",
    status: "connected",
    capabilities,
  };
}

function deriveEmail(skills: SkillStatusReport | null): ServiceCard | null {
  const himalaya = skills?.skills.find((s) => s.name.toLowerCase().includes("himalaya"));
  if (!himalaya) {
    return null;
  }

  const capabilities: Capability[] = [];

  // Read inbox
  if (himalaya.eligible && !himalaya.disabled) {
    capabilities.push({
      name: "Read inbox",
      status: "enabled",
      detail: "Himalaya CLI",
    });
  } else {
    capabilities.push({
      name: "Read inbox",
      status: "disabled",
      detail: himalaya.disabled ? "Skill disabled" : "Not eligible",
    });
  }

  // Send email - always requires approval
  capabilities.push({
    name: "Send email",
    status: "escalate",
    detail: "Requires owner approval",
  });

  return {
    id: "email",
    label: "Email",
    icon: "📧",
    category: "productivity",
    status: himalaya.eligible && !himalaya.disabled ? "connected" : "disconnected",
    capabilities,
  };
}

function deriveGitHub(config: Record<string, unknown> | null): ServiceCard | null {
  const tools = getConfigValue(config, "tools") as Record<string, unknown> | undefined;
  if (!tools) {
    return {
      id: "github",
      label: "GitHub",
      icon: "🐙",
      category: "development",
      status: "connected",
      capabilities: [
        { name: "CLI access", status: "enabled", detail: "Via gh command" },
        { name: "Read repos", status: "enabled", detail: "Public & private" },
        { name: "Create issues/PRs", status: "enabled", detail: "Via CLI" },
      ],
    };
  }

  const execDenied = (tools.deny as string[] | undefined)?.includes("exec");
  const capabilities: Capability[] = [];

  if (execDenied) {
    capabilities.push({
      name: "CLI access",
      status: "disabled",
      detail: "Exec tool denied",
      configPath: "tools.deny",
    });
  } else {
    capabilities.push({
      name: "CLI access",
      status: "enabled",
      detail: "Via gh command",
    });
    capabilities.push({
      name: "Read repos",
      status: "enabled",
      detail: "Public & private",
    });
    capabilities.push({
      name: "Create issues/PRs",
      status: "enabled",
      detail: "Via CLI",
    });
  }

  return {
    id: "github",
    label: "GitHub",
    icon: "🐙",
    category: "development",
    status: execDenied ? "disconnected" : "connected",
    capabilities,
  };
}

function deriveNotion(skills: SkillStatusReport | null): ServiceCard | null {
  const notion = skills?.skills.find((s) => s.name.toLowerCase().includes("notion"));
  if (!notion) {
    return null;
  }

  const capabilities: Capability[] = [];

  if (notion.eligible && !notion.disabled) {
    capabilities.push({
      name: "Read pages",
      status: "enabled",
      detail: "API key configured",
    });
    capabilities.push({
      name: "Write/update",
      status: "enabled",
      detail: "Full access",
    });
  } else {
    capabilities.push({
      name: "Read/write",
      status: "disabled",
      detail: notion.disabled ? "Skill disabled" : "API key missing",
    });
  }

  return {
    id: "notion",
    label: "Notion",
    icon: "📝",
    category: "productivity",
    status: notion.eligible && !notion.disabled ? "connected" : "disconnected",
    capabilities,
  };
}

function deriveBrowser(config: Record<string, unknown> | null): ServiceCard | null {
  const browser = getConfigValue(config, "browser");
  if (!browser || typeof browser !== "object") {
    return {
      id: "browser",
      label: "Browser",
      icon: "🌐",
      category: "infrastructure",
      status: "disconnected",
      capabilities: [
        { name: "Browsing", status: "disabled", detail: "Not configured" },
      ],
    };
  }

  const browserCfg = browser as Record<string, unknown>;
  const capabilities: Capability[] = [];

  capabilities.push({
    name: "Browsing",
    status: "enabled",
    detail: "Configured",
    configPath: "browser",
  });

  const headless = browserCfg.headless;
  capabilities.push({
    name: "Headless mode",
    status: "enabled",
    detail: headless === false ? "Visible" : "Headless",
    configPath: "browser.headless",
  });

  return {
    id: "browser",
    label: "Browser",
    icon: "🌐",
    category: "infrastructure",
    status: "connected",
    capabilities,
  };
}

function deriveShell(config: Record<string, unknown> | null): ServiceCard | null {
  const tools = getConfigValue(config, "tools") as Record<string, unknown> | undefined;
  const capabilities: Capability[] = [];

  if (!tools) {
    capabilities.push({
      name: "Run commands",
      status: "enabled",
      detail: "Allowed",
    });
    capabilities.push({
      name: "Elevated access",
      status: "disabled",
      detail: "Not configured",
    });
  } else {
    const execDenied = (tools.deny as string[] | undefined)?.includes("exec");
    const execAllowed = (tools.allow as string[] | undefined)?.includes("exec");

    if (execDenied) {
      capabilities.push({
        name: "Run commands",
        status: "disabled",
        detail: "Exec tool denied",
        configPath: "tools.deny",
      });
    } else if (execAllowed) {
      capabilities.push({
        name: "Run commands",
        status: "enabled",
        detail: "Explicitly allowed",
        configPath: "tools.allow",
      });
    } else {
      capabilities.push({
        name: "Run commands",
        status: "enabled",
        detail: "Allowed",
      });
    }

    const elevated = tools.elevated as Record<string, unknown> | undefined;
    if (elevated && elevated.enabled) {
      capabilities.push({
        name: "Elevated access",
        status: "escalate",
        detail: "Requires approval",
        configPath: "tools.elevated",
      });
    } else {
      capabilities.push({
        name: "Elevated access",
        status: "disabled",
        detail: "Not enabled",
        configPath: "tools.elevated",
      });
    }
  }

  return {
    id: "shell",
    label: "Shell",
    icon: "🖥️",
    category: "infrastructure",
    status: "connected",
    capabilities,
  };
}

function deriveCron(): ServiceCard {
  return {
    id: "cron",
    label: "Cron",
    icon: "⏰",
    category: "infrastructure",
    status: "connected",
    capabilities: [
      {
        name: "Scheduled jobs",
        status: "enabled",
        detail: "Gateway running",
      },
      {
        name: "Recurring tasks",
        status: "enabled",
        detail: "Cron service active",
      },
    ],
  };
}

function deriveWebSearch(config: Record<string, unknown> | null): ServiceCard | null {
  const tools = getConfigValue(config, "tools") as Record<string, unknown> | undefined;
  const web = tools?.web as Record<string, unknown> | undefined;

  const capabilities: Capability[] = [];

  const search = web?.search as Record<string, unknown> | undefined;
  const hasApiKey = Boolean(search?.apiKey);

  if (hasApiKey) {
    capabilities.push({
      name: "Web search",
      status: "enabled",
      detail: "Brave API configured",
      configPath: "tools.web.search.apiKey",
    });
  } else {
    capabilities.push({
      name: "Web search",
      status: "disabled",
      detail: "API key missing",
      configPath: "tools.web.search.apiKey",
    });
  }

  return {
    id: "web-search",
    label: "Web Search",
    icon: "🔍",
    category: "infrastructure",
    status: hasApiKey ? "connected" : "disconnected",
    capabilities,
  };
}

function deriveServices(
  config: Record<string, unknown> | null,
  channels: ChannelsStatusSnapshot | null,
  skills: SkillStatusReport | null
): ServiceCard[] {
  const services: ServiceCard[] = [];

  // Messaging
  const whatsapp = deriveWhatsApp(config);
  if (whatsapp) services.push(whatsapp);

  const slack = deriveSlack(config);
  if (slack) services.push(slack);

  const bluebubbles = deriveBlueBubbles(config);
  if (bluebubbles) services.push(bluebubbles);

  // Productivity
  const email = deriveEmail(skills);
  if (email) services.push(email);

  const notion = deriveNotion(skills);
  if (notion) services.push(notion);

  // Development
  const github = deriveGitHub(config);
  if (github) services.push(github);

  // Infrastructure
  const browser = deriveBrowser(config);
  if (browser) services.push(browser);

  const shell = deriveShell(config);
  if (shell) services.push(shell);

  services.push(deriveCron());

  const webSearch = deriveWebSearch(config);
  if (webSearch) services.push(webSearch);

  return services;
}

function groupByCategory(services: ServiceCard[]): Record<string, ServiceCard[]> {
  const grouped: Record<string, ServiceCard[]> = {
    messaging: [],
    productivity: [],
    development: [],
    infrastructure: [],
  };

  for (const service of services) {
    grouped[service.category].push(service);
  }

  return grouped;
}

function renderServiceCard(service: ServiceCard) {
  const enabledCount = service.capabilities.filter((c) => c.status === "enabled").length;
  const scopedCount = service.capabilities.filter(
    (c) => c.status === "scoped" || c.status === "escalate"
  ).length;
  const disabledCount = service.capabilities.filter((c) => c.status === "disabled").length;

  const statusColor = service.status === "connected" ? "var(--success-color, #0a7f5a)" : "var(--muted-color, #888)";

  return html`
    <details style="border: 1px solid var(--border); border-radius: 8px; padding: 12px; background: var(--bg-2);">
      <summary style="cursor: pointer; list-style: none; user-select: none;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 24px;">${service.icon}</span>
            <div>
              <div style="font-weight: 500; display: flex; align-items: center; gap: 6px;">
                ${service.label}
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></span>
              </div>
              <div style="font-size: 12px; color: var(--muted-color); margin-top: 2px;">
                ${enabledCount > 0 ? html`<span>✅ ${enabledCount}</span>` : nothing}
                ${scopedCount > 0 ? html`<span style="margin-left: 8px;">⚠️ ${scopedCount}</span>` : nothing}
                ${disabledCount > 0 ? html`<span style="margin-left: 8px;">❌ ${disabledCount}</span>` : nothing}
              </div>
            </div>
          </div>
        </div>
      </summary>

      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
          <thead>
            <tr style="text-align: left; color: var(--muted-color); font-size: 11px; text-transform: uppercase;">
              <th style="padding: 4px 8px;">Capability</th>
              <th style="padding: 4px 8px;">Status</th>
              <th style="padding: 4px 8px;">Detail</th>
            </tr>
          </thead>
          <tbody>
            ${service.capabilities.map((cap) => {
              let badgeColor: string;
              let badgeText: string;

              switch (cap.status) {
                case "enabled":
                  badgeColor = "var(--success-color, #0a7f5a)";
                  badgeText = "Enabled";
                  break;
                case "scoped":
                  badgeColor = "var(--warning-color, #f59e0b)";
                  badgeText = "Scoped";
                  break;
                case "escalate":
                  badgeColor = "var(--warning-color, #f59e0b)";
                  badgeText = "Escalate";
                  break;
                case "disabled":
                  badgeColor = "var(--danger-color, #d14343)";
                  badgeText = "Disabled";
                  break;
              }

              return html`
                <tr style="border-top: 1px solid var(--border);">
                  <td style="padding: 6px 8px;">${cap.name}</td>
                  <td style="padding: 6px 8px;">
                    <span style="
                      display: inline-block;
                      padding: 2px 8px;
                      border-radius: 4px;
                      font-size: 11px;
                      font-weight: 500;
                      background: ${badgeColor}22;
                      color: ${badgeColor};
                    ">
                      ${badgeText}
                    </span>
                  </td>
                  <td style="padding: 6px 8px; color: var(--muted-color); font-size: 12px;">
                    ${cap.detail || "—"}
                    ${cap.configPath ? html`<span class="mono" style="margin-left: 8px; opacity: 0.6;">${cap.configPath}</span>` : nothing}
                  </td>
                </tr>
              `;
            })}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

export function renderServices(props: ServicesProps) {
  if (!props.connected) {
    return html`
      <section class="card">
        <div class="muted">Connect to gateway to view services.</div>
      </section>
    `;
  }

  const services = deriveServices(props.config, props.channelsSnapshot, props.skillsReport);
  const categories = groupByCategory(services);

  const totalEnabled = services.reduce(
    (sum, s) => sum + s.capabilities.filter((c) => c.status === "enabled").length,
    0
  );
  const totalScoped = services.reduce(
    (sum, s) =>
      sum + s.capabilities.filter((c) => c.status === "scoped" || c.status === "escalate").length,
    0
  );
  const totalDisabled = services.reduce(
    (sum, s) => sum + s.capabilities.filter((c) => c.status === "disabled").length,
    0
  );

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Services & Permissions</div>
          <div class="card-sub">What this agent can and can't do. Derived from gateway config.</div>
        </div>
      </div>

      <div style="display: flex; gap: 16px; margin-top: 12px;">
        <div class="pill">${services.filter((s) => s.status === "connected").length} Connected</div>
        <div class="pill">${totalEnabled} Enabled</div>
        <div class="pill" style="background: var(--warning-color, #f59e0b)22; color: var(--warning-color, #f59e0b);">
          ${totalScoped} Scoped
        </div>
        <div class="pill" style="background: var(--danger-color, #d14343)22; color: var(--danger-color, #d14343);">
          ${totalDisabled} Denied
        </div>
      </div>
    </section>

    ${Object.entries(categories).map(([category, cards]) => {
      if (cards.length === 0) return nothing;

      return html`
        <section class="card" style="margin-top: 16px;">
          <div class="card-title" style="text-transform: capitalize;">${category}</div>
          <div
            style="
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
              gap: 12px;
              margin-top: 12px;
            "
          >
            ${cards.map((card) => renderServiceCard(card))}
          </div>
        </section>
      `;
    })}
  `;
}
