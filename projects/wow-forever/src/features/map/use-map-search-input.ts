import { useEffect, useRef, useState } from "react";

/** Keep keystrokes inside the field; publish only a settled query to the map. */
export function useMapSearchInput(query: string, onQueryChange: (query: string) => void) {
  const [input, setInput] = useState({ value: query, external: query, published: query });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const published = useRef(query);
  if (input.external !== query) {
    setInput({ value: input.published === query ? input.value : query, external: query, published: query });
  }
  useEffect(() => {
    // External navigation overrides pending typing; acknowledgements of our own
    // publication must preserve any newer text already in the field.
    if (published.current !== query) clearTimeout(timer.current);
    published.current = query;
  }, [query]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const update = (next: string, immediate = false) => {
    clearTimeout(timer.current);
    setInput(current => ({ ...current, value: next }));
    const publish = () => {
      published.current = next;
      setInput(current => ({ ...current, published: next }));
      onQueryChange(next);
    };
    if (immediate || !next.trim()) publish();
    else timer.current = setTimeout(publish, 140);
  };
  return [input.external === query ? input.value : query, update] as const;
}
