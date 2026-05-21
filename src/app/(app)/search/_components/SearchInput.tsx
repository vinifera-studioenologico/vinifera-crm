"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

interface SearchInputProps {
  defaultValue?: string;
}

/**
 * Input di ricerca con debounce da 300ms.
 * Naviga automaticamente a /search?q=... senza full-page reload.
 */
export function SearchInput({ defaultValue = "" }: SearchInputProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adjust state during render when defaultValue changes (e.g. browser back/forward).
  // This is the React-recommended pattern instead of useEffect + setState.
  const [prevDefault, setPrevDefault] = useState(defaultValue);
  if (prevDefault !== defaultValue) {
    setPrevDefault(defaultValue);
    setValue(defaultValue);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const trimmed = next.trim();
      if (trimmed.length === 0) {
        router.replace("/search");
      } else {
        router.replace(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    }, 300);
  }

  function handleClear() {
    setValue("");
    if (timerRef.current) clearTimeout(timerRef.current);
    router.replace("/search");
  }

  return (
    <div className="relative flex-1 max-w-lg">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
        strokeWidth={1.75}
      />
      <input
        autoFocus
        type="search"
        placeholder="Cerca clienti, campioni, preventivi, referti…"
        value={value}
        onChange={handleChange}
        className="w-full h-10 rounded-lg border border-input bg-background pl-9 pr-9 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cancella ricerca"
        >
          <X className="size-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
