/**
 * useSessionSearch hook — semantic search across sessions.
 * Uses the sessions.search RPC endpoint for server-side search.
 */

import { useState, useCallback, useRef } from "react";
import { useGatewayStore } from "../stores/gateway-store";

export interface SessionSearchResult {
  sessionKey: string;
  sessionId: string;
  score: number;
  matchCount: number;
  snippet: string;
  snippetRole: "user" | "assistant";
  updatedAt: number | null;
  derivedTitle?: string;
}

interface SearchResponse {
  results: SessionSearchResult[];
}

interface UseSessionSearchReturn {
  query: string;
  results: SessionSearchResult[] | null;
  isLoading: boolean;
  error: string | null;
  search: (q: string) => void;
  clear: () => void;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

export function useSessionSearch(): UseSessionSearchReturn {
  const { request, connected } = useGatewayStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SessionSearchResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(
    (q: string) => {
      setQuery(q);

      // Clear pending debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      // Short queries: clear results
      if (q.length < MIN_QUERY_LENGTH) {
        setResults(null);
        setIsLoading(false);
        setError(null);
        return;
      }

      // Not connected: show error
      if (!connected) {
        setError("Not connected to gateway");
        setResults(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      // Debounce the actual search
      debounceRef.current = setTimeout(async () => {
        try {
          const response = await request<SearchResponse>("sessions.search", {
            query: q,
            limit: 20,
          });
          setResults(response?.results ?? []);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setResults(null);
        } finally {
          setIsLoading(false);
        }
      }, DEBOUNCE_MS);
    },
    [request, connected],
  );

  const clear = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setQuery("");
    setResults(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { query, results, isLoading, error, search, clear };
}
