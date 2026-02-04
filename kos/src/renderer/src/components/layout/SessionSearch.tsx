/**
 * SessionSearch component — search input and results for session search.
 * Uses semantic search via sessions.search RPC.
 */

import { Loader2, Search, X } from "lucide-react";
import type { SessionSearchResult } from "../../hooks/use-session-search";
import { useSessionSearch } from "../../hooks/use-session-search";
import { cn } from "../../lib/utils";

interface SessionSearchProps {
  onSelectSession: (sessionKey: string) => void;
  className?: string;
}

export function SessionSearch({ onSelectSession, className }: SessionSearchProps) {
  const { query, results, isLoading, error, search, clear } = useSessionSearch();

  const hasResults = results !== null;

  return (
    <div className={cn("relative", className)}>
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search sessions..."
          value={query}
          onChange={(e) => search(e.target.value)}
          className={cn(
            "w-full h-8 pl-8 pr-8 text-sm rounded-md",
            "border border-input bg-background",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          )}
          aria-label="Search sessions"
        />
        {isLoading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
        )}
        {query && !isLoading && (
          <button
            onClick={clear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Search results dropdown */}
      {hasResults && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-y-auto">
          {error ? (
            <div className="px-3 py-2 text-sm text-destructive">{error}</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results found</div>
          ) : (
            <div className="py-1">
              {results.map((result) => (
                <SearchResultItem
                  key={result.sessionKey}
                  result={result}
                  onSelect={() => {
                    onSelectSession(result.sessionKey);
                    clear();
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SearchResultItemProps {
  result: SessionSearchResult;
  onSelect: () => void;
}

function SearchResultItem({ result, onSelect }: SearchResultItemProps) {
  const roleIcon = result.snippetRole === "user" ? "👤" : "🤖";
  const title = result.derivedTitle || `Session ${result.sessionKey.slice(0, 8)}...`;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full px-3 py-2 text-left",
        "hover:bg-accent transition-colors",
        "focus-visible:outline-none focus-visible:bg-accent",
      )}
    >
      <div className="text-sm font-medium truncate">{title}</div>
      <div
        className={cn(
          "text-[10px] text-muted-foreground truncate mt-0.5",
          "bg-accent/10 px-1 py-0.5 rounded inline-block max-w-full",
        )}
        title={result.snippet}
      >
        {roleIcon} {result.snippet}
      </div>
    </button>
  );
}
