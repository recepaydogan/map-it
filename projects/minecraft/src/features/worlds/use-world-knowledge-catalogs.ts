import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GAME_GUIDE_SOURCES } from "../../game-config";
import { EMPTY_KNOWLEDGE_CATALOGS, type KnowledgeCatalogs } from "../knowledge/knowledge-catalogs";
import { resolveBuiltInMechanicsCatalog } from "../knowledge/built-in-mechanics-catalog";
import { resolveBuiltInRecipeCatalog } from "../knowledge/built-in-recipe-catalog";
import { KNOWLEDGE_DATA_BASE_URL } from "../knowledge/knowledge-data-url";
import { loadRemoteKnowledgeCatalogs } from "../knowledge/remote-knowledge-catalog";

/** Catalog identity is independent of frequently persisted player/camera state. */
export const useWorldKnowledgeCatalogs = (guideWorldId: string | undefined, guideEdition: string | undefined,
  guideVersion: string | undefined, guideSource: (typeof GAME_GUIDE_SOURCES)[number] | null) => {
  const { i18n } = useTranslation();
  const [remoteKnowledge, setRemoteKnowledge] = useState<{ key: string; phase: "ready" | "error";
    catalogs: KnowledgeCatalogs } | null>(null);
  const guideKey = guideWorldId ? `${guideWorldId}:${guideEdition}:${guideVersion}` : "";
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const builtInMechanics = useMemo(() => guideEdition && guideVersion ? resolveBuiltInMechanicsCatalog(guideEdition, guideVersion, locale,
    (language, key) => i18n.getFixedT(language)(key)) : null, [guideEdition, guideVersion, locale, i18n]);
  const builtInRecipes = useMemo(() => guideEdition && guideVersion ? resolveBuiltInRecipeCatalog(guideEdition, guideVersion) : null,
    [guideEdition, guideVersion]);
  useEffect(() => {
    if (!guideKey || !guideEdition || !guideVersion || !guideSource || !KNOWLEDGE_DATA_BASE_URL) return;
    const key = guideKey;
    const controller = new AbortController();
    void loadRemoteKnowledgeCatalogs({ baseUrl: KNOWLEDGE_DATA_BASE_URL, edition: guideEdition, version: guideVersion,
      itemIdentity: guideSource.itemIdentity, recipeIdentity: guideSource.recipeIdentity,
      brewingIdentity: guideSource.brewingRevision ? { edition: guideSource.edition, version: guideSource.version,
        revision: guideSource.brewingRevision } : undefined,
      signal: controller.signal }).then(catalogs => setRemoteKnowledge({ key, phase: "ready", catalogs })).catch(error => {
        if (controller.signal.aborted) return;
        console.error("[World knowledge] Remote catalog load failed", error);
        setRemoteKnowledge({ key, phase: "error", catalogs: EMPTY_KNOWLEDGE_CATALOGS });
      });
    return () => controller.abort();
  }, [guideKey, guideEdition, guideVersion, guideSource]);
  const remoteCatalogs = remoteKnowledge?.key === guideKey && remoteKnowledge.phase === "ready"
    ? remoteKnowledge.catalogs : EMPTY_KNOWLEDGE_CATALOGS;
  const automaticCatalogs = useMemo<KnowledgeCatalogs>(() => ({ items: remoteCatalogs.items,
    recipes: remoteCatalogs.recipes ?? builtInRecipes,
    mechanics: remoteCatalogs.mechanics ?? builtInMechanics }), [remoteCatalogs, builtInRecipes, builtInMechanics]);
  return automaticCatalogs;
};
