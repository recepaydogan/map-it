import { useEffect, useState } from "react";
import { GAME_GUIDE_SOURCES } from "../../game-config";
import { useWorldLibrary } from "../worlds/use-world-library";
import { EMPTY_KNOWLEDGE_CATALOGS, type KnowledgeCatalogs } from "../knowledge/knowledge-catalogs";
import { KNOWLEDGE_DATA_BASE_URL } from "../knowledge/knowledge-data-url";
import { loadRemoteKnowledgeCatalogs } from "../knowledge/remote-knowledge-catalog";
import { useGuideSourceSelection } from "../knowledge/use-guide-source-selection";

export const CRAFTING_GUIDE_SOURCES = GAME_GUIDE_SOURCES.filter(source => source.recipeIdentity !== null);

export const useCraftingCatalog = () => {
  const library = useWorldLibrary();
  const world = library.data?.worlds.find(candidate => candidate.id === library.data?.selection.worldId) ?? null;
  const { source, selectSource } = useGuideSourceSelection(CRAFTING_GUIDE_SOURCES, {
    fallbackEdition: world?.edition,
    fallbackVersion: world?.generation.version,
  });
  const [result, setResult] = useState<{ key: string; catalogs: KnowledgeCatalogs; error: boolean } | null>(null);
  const key = `${source.gameId}:${source.edition}:${source.version}`;
  useEffect(() => {
    const abort = new AbortController();
    loadRemoteKnowledgeCatalogs({ baseUrl: KNOWLEDGE_DATA_BASE_URL, edition: source.edition, version: source.version,
      itemIdentity: source.itemIdentity, recipeIdentity: source.recipeIdentity,
      brewingIdentity: source.brewingRevision ? { edition: source.edition, version: source.version,
        revision: source.brewingRevision } : undefined, signal: abort.signal }).then(catalogs => {
      if (!abort.signal.aborted) setResult({ key, catalogs, error: false });
    }).catch(error => {
      if (abort.signal.aborted) return;
      console.error("Crafting catalog load failed", error);
      setResult({ key, catalogs: EMPTY_KNOWLEDGE_CATALOGS, error: true });
    });
    return () => abort.abort();
  }, [key, source]);
  const catalogs = result?.key === key ? result.catalogs : EMPTY_KNOWLEDGE_CATALOGS;
  return { world, source, selectSource, catalogs, catalog: catalogs.recipes,
    loading: result?.key !== key, error: result?.key === key && result.error };
};
