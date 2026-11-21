import type { TFunction } from "i18next";
import { withGameEntityProfiles } from "./game-entity-profiles";
import { withGameEntitySections } from "./game-entity-sections";
import { withGameEntitySpecialRewards } from "./game-entity-special-rewards";
import { gameKnowledgeBiomeFamily, gameKnowledgeSubjectDescription } from "./game-knowledge-subject-display";
import { withGameStructureLootSources } from "./game-structure-loot-sources";
import { availableKnowledgeItemIds, type KnowledgeCatalogs } from "./knowledge-catalogs";
import { createKnowledgeInspectorResolver } from "./knowledge-inspector-content";
import type { KnowledgeSubjectDisplay } from "./mechanics-inspector-content";

/** Resolve the same connected entity guide in the Guide and Map inspectors. */
export const createConnectedKnowledgeInspectorResolver = (catalogs: KnowledgeCatalogs,
  display: KnowledgeSubjectDisplay, t: TFunction, locale: string, edition: string, version: string) => {
  const items = availableKnowledgeItemIds(catalogs);
  return withGameEntitySections(withGameEntityProfiles(withGameEntitySpecialRewards(withGameStructureLootSources(
    createKnowledgeInspectorResolver(catalogs.recipes, catalogs.mechanics, display, t, locale,
      id => gameKnowledgeBiomeFamily(id, key => t(key)),
      (kind, id) => gameKnowledgeSubjectDescription(kind, id, key => t(key, { defaultValue: "" }))),
    display, t, { edition, version }),
    display, t, catalogs.mechanics, items, edition),
    display, t, catalogs.mechanics, items, edition), t);
};
