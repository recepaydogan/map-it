import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_GUIDE_ENTITY_LOOT_ACTIONS, GAME_GUIDE_SOURCES } from "../../game-config";
import { useWorldLibrary } from "../worlds/use-world-library";
import { EMPTY_KNOWLEDGE_CATALOGS, type KnowledgeCatalogs } from "./knowledge-catalogs";
import { KNOWLEDGE_DATA_BASE_URL } from "./knowledge-data-url";
import { loadRemoteKnowledgeCatalogs } from "./remote-knowledge-catalog";
import GameGuideBrowser from "./game-guide-browser";
import type { GuideKind } from "./game-guide-categories";
import type { GuideSource } from "./guide-source-controls";
import type { InspectorSubject } from "../inspector/inspector-controller";
import { useGuideSourceSelection } from "./use-guide-source-selection";
import { connectEntityLootActions } from "./connect-entity-loot-actions";

export default function GameGuidePage({ guideKind, initialSubject, initialSource, backLabel, onGuideKindChange,
  onSearchStructureMap, onClose }: {
  guideKind: GuideKind;
  initialSubject?: InspectorSubject | null;
  initialSource?: GuideSource | null;
  backLabel?: string;
  onGuideKindChange: (kind: GuideKind) => void;
  onSearchStructureMap?: (knowledgeId: string) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const library = useWorldLibrary();
  const selected = library.data?.worlds.find(world => world.id === library.data?.selection.worldId);
  const { source, selectSource } = useGuideSourceSelection(GAME_GUIDE_SOURCES, {
    initialSource,
    fallbackEdition: selected?.edition,
    fallbackVersion: selected?.generation.version,
  });
  const [result, setResult] = useState<{ source: typeof source; catalogs: KnowledgeCatalogs; phase: "ready" | "error" } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    loadRemoteKnowledgeCatalogs({ baseUrl: KNOWLEDGE_DATA_BASE_URL, edition: source.edition, version: source.version,
      itemIdentity: source.itemIdentity, recipeIdentity: source.recipeIdentity,
      brewingIdentity: source.brewingRevision ? { edition: source.edition, version: source.version,
        revision: source.brewingRevision } : undefined,
      signal: abort.signal }).then(catalogs => setResult({ source, catalogs, phase: "ready" })).catch(error => {
      if (abort.signal.aborted) return;
      console.error("Guide catalog load failed", error);
      setResult({ source, catalogs: EMPTY_KNOWLEDGE_CATALOGS, phase: "error" });
    });
    return () => abort.abort();
  }, [source]);
  const current = result?.source === source ? result : null;
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const catalogs = useMemo(() => {
    const loaded = current?.catalogs ?? EMPTY_KNOWLEDGE_CATALOGS;
    return source.edition === "java" ? { ...loaded, mechanics: connectEntityLootActions(
      loaded.mechanics, GAME_GUIDE_ENTITY_LOOT_ACTIONS, { locale,
        translate: (key, language) => t(key, { lng: language }) }) } : loaded;
  }, [current, source.edition, locale, t]);
  return <GameGuideBrowser key={`${source.edition}:${source.version}`} source={source} catalogs={catalogs}
    phase={current?.phase ?? "loading"} kind={guideKind} initialSubject={initialSubject} onKindChange={onGuideKindChange}
    rootBackLabel={backLabel} onSourceChange={(gameId, edition, version) => {
      selectSource(gameId, edition, version);
    }} onSearchStructureMap={onSearchStructureMap} onClose={onClose} />;
}
