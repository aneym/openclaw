import { Slash } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/stores/gateway-store";

interface SkillInfo {
  name: string;
  description?: string;
}

interface SlashAutocompleteProps {
  /** Container ref to find the textarea DOM element */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Called when user selects a command — replaces compose text */
  onSelect: (command: string) => void;
}

export function SlashAutocomplete({ containerRef, onSelect }: SlashAutocompleteProps) {
  const request = useGatewayStore((s) => s.request);
  const connected = useGatewayStore((s) => s.connected);

  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch skills list on mount
  useEffect(() => {
    if (!connected) {
      return;
    }
    void request<{ skills: SkillInfo[] }>("skills.status")
      .then((res) => {
        if (res?.skills) {
          setSkills(res.skills);
        }
      })
      .catch(() => {
        // Gateway may not support skills.status — use empty list
      });
  }, [connected, request]);

  // Filter skills by query
  const filtered = useMemo(() => {
    if (!query) {
      return skills;
    }
    const q = query.toLowerCase();
    return skills.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q),
    );
  }, [skills, query]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  // Observe textarea input to detect "/" at start
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const textarea = container.querySelector("textarea");
    if (!textarea) {
      return;
    }

    const handleInput = () => {
      const value = textarea.value;
      if (value.startsWith("/")) {
        setIsOpen(true);
        setQuery(value.slice(1));
        setSelectedIndex(0);
      } else {
        setIsOpen(false);
        setQuery("");
      }
    };

    // Listen for input events (covers typing, paste, etc.)
    textarea.addEventListener("input", handleInput);
    // Also check on focus in case the value was already "/"
    textarea.addEventListener("focus", handleInput);

    return () => {
      textarea.removeEventListener("input", handleInput);
      textarea.removeEventListener("focus", handleInput);
    };
  }, [containerRef]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const textarea = container.querySelector("textarea");
    if (!textarea) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) {
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const selected = filtered[selectedIndex];
        if (selected) {
          onSelect(`/${selected.name} `);
          setIsOpen(false);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
      } else if (e.key === "Tab" && filtered.length > 0) {
        e.preventDefault();
        const selected = filtered[selectedIndex];
        if (selected) {
          onSelect(`/${selected.name} `);
          setIsOpen(false);
        }
      }
    };

    textarea.addEventListener("keydown", handleKeyDown, true);
    return () => textarea.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, filtered, selectedIndex, onSelect, containerRef]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) {
      return;
    }
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleItemClick = useCallback(
    (skill: SkillInfo) => {
      onSelect(`/${skill.name} `);
      setIsOpen(false);
    },
    [onSelect],
  );

  if (!isOpen || filtered.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-full left-0 right-0 z-20 px-4 pb-1">
      <div
        ref={listRef}
        className="mx-auto max-w-2xl w-full rounded-md border border-border bg-popover shadow-md overflow-hidden max-h-48 overflow-y-auto"
      >
        {filtered.map((skill, idx) => (
          <button
            key={skill.name}
            onClick={() => handleItemClick(skill)}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors",
              idx === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted/50",
            )}
          >
            <Slash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="font-medium">{skill.name}</span>
            {skill.description && (
              <span className="text-xs text-muted-foreground truncate">{skill.description}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
