import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useLinearStore } from "../../stores/linear-store";
import { useSettingsStore } from "../../stores/settings-store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface LinearTeamPickerProps {
  value?: string;
  onChange: (teamId: string | undefined) => void;
}

export function LinearTeamPicker({ value, onChange }: LinearTeamPickerProps) {
  const isLinearConnected = useSettingsStore((s) => s.isLinearConnected)();
  const teams = useLinearStore((s) => s.teams);
  const isLoading = useLinearStore((s) => s.isLoading);
  const fetchTeams = useLinearStore((s) => s.fetchTeams);

  useEffect(() => {
    if (isLinearConnected && teams.length === 0) {
      fetchTeams();
    }
  }, [isLinearConnected, teams.length, fetchTeams]);

  if (!isLinearConnected) {
    return (
      <div className="text-sm text-muted-foreground">
        Connect Linear in Settings to link a team.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading teams...
      </div>
    );
  }

  return (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? undefined : v)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="No team linked" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No team linked</SelectItem>
        {teams.map((team) => (
          <SelectItem key={team.id} value={team.id}>
            {team.name} ({team.key})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
