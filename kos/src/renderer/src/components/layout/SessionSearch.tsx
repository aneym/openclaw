/**
 * SessionSearch — client-side search input that filters the sidebar chat list.
 */

import { Search, X } from "lucide-react";
import { cn } from "../../lib/utils";

interface SessionSearchProps {
  query: string;
  onChange: (query: string) => void;
  className?: string;
}

export function SessionSearch({ query, onChange, className }: SessionSearchProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <input
        type="text"
        placeholder="Search chats..."
        value={query}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full h-8 pl-8 pr-8 text-sm rounded-md",
          "border border-input bg-background",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
        aria-label="Search chats"
      />
      {query && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
