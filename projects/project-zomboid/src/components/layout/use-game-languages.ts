import { useEffect, useState } from "react";
import { sortGameLanguagesByPopularity } from "../../game-content/game-language-order";
import { getMapDataUrl } from "../../features/map/map-data-url";

interface GameLanguage {
  code: string;
  name: string;
}

interface GameLanguageIndex {
  languages: GameLanguage[];
}

export function useGameLanguages(enabled = true) {
  const [languages, setLanguages] = useState<GameLanguage[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch(getMapDataUrl("locales/index.json"), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Game language index request failed with ${response.status}.`);
        return response.json() as Promise<GameLanguageIndex>;
      })
      .then((index) => setLanguages(sortGameLanguagesByPopularity(
        index.languages.filter(({ code }) => code !== "strew"),
      )))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.warn("Game language index could not be loaded.", error);
      });
    return () => controller.abort();
  }, [enabled]);
  return languages;
}
