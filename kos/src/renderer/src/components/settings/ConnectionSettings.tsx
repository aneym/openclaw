import { useEffect, useMemo, useState } from "react";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export function ConnectionSettings() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const [gatewayUrl, setGatewayUrl] = useState(activeWorkspace?.gatewayUrl ?? "");
  const [gatewayToken, setGatewayToken] = useState(activeWorkspace?.gatewayToken ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGatewayUrl(activeWorkspace?.gatewayUrl ?? "");
    setGatewayToken(activeWorkspace?.gatewayToken ?? "");
  }, [activeWorkspace?.id]);

  const canSave = useMemo(() => {
    if (!activeWorkspace) {
      return false;
    }
    return (
      gatewayUrl.trim() !== (activeWorkspace.gatewayUrl ?? "") ||
      gatewayToken.trim() !== (activeWorkspace.gatewayToken ?? "")
    );
  }, [activeWorkspace, gatewayToken, gatewayUrl]);

  const handleSave = () => {
    if (!activeWorkspace) {
      return;
    }
    setSaving(true);
    updateWorkspace(activeWorkspace.id, {
      gatewayUrl: gatewayUrl.trim(),
      gatewayToken: gatewayToken.trim() || undefined,
    });
    setSaving(false);
  };

  if (!activeWorkspace) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Connection</h2>
        <p className="text-sm text-muted-foreground">
          Configure the gateway URL and token for this workspace.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="gateway-url">Gateway URL</Label>
          <Input
            id="gateway-url"
            value={gatewayUrl}
            onChange={(e) => setGatewayUrl(e.target.value)}
            placeholder="ws://localhost:18789"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gateway-token">Gateway Token</Label>
          <Input
            id="gateway-token"
            type="password"
            value={gatewayToken}
            onChange={(e) => setGatewayToken(e.target.value)}
            placeholder="Paste your gateway token"
          />
          <p className="text-xs text-muted-foreground">
            Required when gateway auth mode is token (default).
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!canSave || saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
