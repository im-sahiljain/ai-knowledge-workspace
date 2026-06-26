"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { SearchResult } from "@/types";
import { Search as SearchIcon, Loader2, FileText } from "lucide-react";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setSearched(true);
    try {
      const data = await api.search(query.trim());
      setResults(data.results);
      if (data.results.length === 0) {
        toast.info("No results found. Try a different query or upload more documents.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Search failed";
      toast.error(msg);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Semantic Search</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search across all your documents using natural language
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., How does dependency injection work?"
              className="flex h-12 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
            Search
          </button>
        </div>
      </form>

      {/* Results */}
      {searching ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Searching your documents...</p>
          </div>
        </div>
      ) : searched && results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <SearchIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="font-semibold">No results found</h3>
          <p className="text-sm text-muted-foreground mt-1">Try rephrasing your query</p>
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((result, i) => (
            <div key={result.chunk_id} className="rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-red-500 shrink-0" />
                    <span className="text-sm font-medium truncate">{result.document_name}</span>
                    {result.page_number && (
                      <span className="text-xs text-muted-foreground">Page {result.page_number}</span>
                    )}
                    <span className="ml-auto text-xs font-medium text-primary">
                      {(result.score * 100).toFixed(0)}% match
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{result.content}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
