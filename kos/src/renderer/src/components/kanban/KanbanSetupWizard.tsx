/**
 * Kanban Setup Wizard
 *
 * Handles the setup flow for connecting Linear to a project:
 * 1. If no Linear API key → show connection form
 * 2. If connected but no team selected → show team picker
 * 3. Allow disconnecting a team from a project
 */

import { Check, Eye, EyeOff, LayoutGrid, Loader2, Unlink, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLinearStore } from "../../stores/linear-store";
import { useProjectStore } from "../../stores/project-store";
import { useSettingsStore } from "../../stores/settings-store";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

// Linear logo SVG
function LinearLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M100 50C100 77.6142 77.6142 100 50 100C22.3858 100 0 77.6142 0 50C0 22.3858 22.3858 0 50 0C77.6142 0 100 22.3858 100 50ZM51.3896 16.4395L84.2894 49.3393C84.7856 47.6162 85.0623 45.8069 85.0869 43.9406L56.8488 15.7025C55.0163 15.724 53.2381 15.9851 51.5397 16.4519L51.3896 16.4395ZM45.9009 18.0174L82.7153 54.8318C81.6685 57.0545 80.3042 59.1062 78.6745 60.9327L39.7999 22.0582C41.6601 20.3948 43.7076 18.9998 45.9009 17.9302L45.9009 18.0174ZM34.9544 26.153L74.5797 65.7783C72.6673 67.4944 70.5224 68.9557 68.1995 70.1116L30.6211 32.5332C31.8068 30.1706 33.2617 27.9899 34.9544 26.0401L34.9544 26.153ZM26.5193 38.8177L61.9149 74.2134C59.5323 75.2972 56.9869 76.0777 54.3329 76.5147L24.2178 46.3996C24.6737 43.6936 25.4291 41.1011 26.456 38.669L26.5193 38.8177ZM23.4751 52.5773L48.1553 77.2575C46.7218 77.4081 45.266 77.4862 43.7927 77.4884L23.2442 56.9399C23.2662 55.4337 23.3523 53.9481 23.5035 52.4852L23.4751 52.5773ZM23.6451 63.0814L37.651 77.0873C32.9696 76.2174 28.6655 74.2865 24.9673 71.5574L23.6451 63.0814L23.6451 63.0814ZM17.3224 58.6881L15.6473 50.2095C15.2197 52.8726 14.9987 55.5966 14.9987 58.3665C14.9987 59.3966 15.0276 60.4194 15.0846 61.4345L17.3224 58.6881Z"
      />
    </svg>
  );
}

interface KanbanSetupWizardProps {
  projectId: string;
  currentTeamId?: string;
  onTeamSelected?: () => void;
}

export function KanbanSetupWizard({
  projectId,
  currentTeamId,
  onTeamSelected,
}: KanbanSetupWizardProps) {
  // Settings store
  const linearConfig = useSettingsStore((s) => s.linearConfig);
  const isSettingsInitialized = useSettingsStore((s) => s.isInitialized);
  const initializeSettings = useSettingsStore((s) => s.initialize);
  const connectLinear = useSettingsStore((s) => s.connectLinear);

  // Linear store
  const teams = useLinearStore((s) => s.teams);
  const isLoadingTeams = useLinearStore((s) => s.isLoading);
  const fetchTeams = useLinearStore((s) => s.fetchTeams);

  // Project store
  const projectsMap = useProjectStore((s) => s.projects);
  const updateProject = useProjectStore((s) => s.updateProject);

  // Verify project exists
  const projectExists = projectsMap.has(projectId);

  // Local state
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(currentTeamId);
  const [isSaving, setIsSaving] = useState(false);

  const isLinearConnected = linearConfig !== null;

  // Initialize settings
  useEffect(() => {
    if (!isSettingsInitialized) {
      initializeSettings();
    }
  }, [isSettingsInitialized, initializeSettings]);

  // Fetch teams when connected
  useEffect(() => {
    if (isLinearConnected && teams.length === 0) {
      fetchTeams();
    }
  }, [isLinearConnected, teams.length, fetchTeams]);

  const handleConnectLinear = useCallback(async () => {
    if (!apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }

    setIsConnecting(true);
    setError(null);

    const result = await connectLinear(apiKey.trim());
    if (!result.success) {
      setError(result.error || "Failed to connect");
    } else {
      setApiKey("");
      // Teams will be fetched automatically via useEffect
    }

    setIsConnecting(false);
  }, [apiKey, connectLinear]);

  const handleSelectTeam = useCallback(async () => {
    if (!selectedTeamId || selectedTeamId === "none") {
      setError("Please select a team first");
      return;
    }

    if (!projectExists) {
      setError(`Project not found: ${projectId}`);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await updateProject(projectId, { linearTeamId: selectedTeamId });
      onTeamSelected?.();
    } catch (err) {
      setError("Failed to save team selection");
    } finally {
      setIsSaving(false);
    }
  }, [selectedTeamId, projectId, projectExists, updateProject, onTeamSelected]);

  const handleDisconnectTeam = useCallback(async () => {
    setIsSaving(true);
    try {
      await updateProject(projectId, { linearTeamId: undefined });
    } catch (err) {
      setError("Failed to disconnect team");
    } finally {
      setIsSaving(false);
    }
  }, [projectId, updateProject]);

  // If already has a team connected, show disconnect option
  if (currentTeamId) {
    const team = teams.find((t) => t.id === currentTeamId);
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background p-8">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
              <LinearLogo className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">Linear Connected</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {team ? `${team.name} (${team.key})` : "Team connected"}
            </p>
          </div>

          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnectTeam}
              disabled={isSaving}
              className="text-muted-foreground"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="mr-2 h-4 w-4" />
              )}
              Disconnect Team
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Connect Linear API if not connected
  if (!isLinearConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background p-8">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
              <LinearLogo className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold">Connect Linear</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Connect your Linear account to view and manage issues
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="linear-api-key">API Key</Label>
              <div className="relative">
                <Input
                  id="linear-api-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="lin_api_xxxxxxxxxxxx"
                  className="pr-10"
                  onKeyDown={(e) => e.key === "Enter" && handleConnectLinear()}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Get your API key from{" "}
                <a
                  href="https://linear.app/settings/account/security"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Linear Settings → Account → Security
                </a>
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <X className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              onClick={handleConnectLinear}
              disabled={isConnecting || !apiKey.trim()}
              className="w-full"
            >
              {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Connect Linear
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Select a team
  return (
    <div className="flex flex-col items-center justify-center h-full bg-background p-8">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 mb-4">
            <Check className="h-6 w-6 text-green-500" />
          </div>
          <h2 className="text-lg font-semibold">Linear Connected</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Logged in as {linearConfig.userName}. Select a team for this project.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Team</Label>
            {isLoadingTeams ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading teams...
              </div>
            ) : teams.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <LayoutGrid className="h-4 w-4" />
                No teams found in your Linear workspace
              </div>
            ) : (
              <Select value={selectedTeamId || "none"} onValueChange={setSelectedTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a team..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>
                    Choose a team...
                  </SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name} ({team.key})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <X className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <Button
            onClick={handleSelectTeam}
            disabled={isSaving || !selectedTeamId || selectedTeamId === "none"}
            className="w-full"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect Team
          </Button>
        </div>
      </div>
    </div>
  );
}
