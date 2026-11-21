import { GAME_KNOWLEDGE_RECIPE_PROFILES, GAME_KNOWLEDGE_RECIPES } from "../../game-config.ts";
import { parseRecipeCatalogArtifact } from "./recipe-catalog-artifact.ts";

/** Assembles only configured exact-version recipes; game identities and source hashes stay in game-config. */
export const resolveBuiltInRecipeCatalog = (edition: string, version: string) => {
  const profile = GAME_KNOWLEDGE_RECIPE_PROFILES.find(candidate => candidate.edition === edition && candidate.version === version);
  if (!profile) return null;
  const artifact = {
    schemaVersion: 2,
    source: { edition, version, revision: profile.revision },
    recipes: profile.files.map(source => {
      const recipe = GAME_KNOWLEDGE_RECIPES.find(candidate => candidate.id === source.id);
      if (!recipe) throw new Error("Built-in recipe profile references an unknown recipe.");
      return { id: recipe.id, method: recipe.method, sourceType: "sourceType" in source ? source.sourceType : recipe.sourceType,
        source: { edition, version, revision: profile.revision, path: source.path, sha256: source.sha256, url: profile.url },
        stations: [...recipe.stations], stationTags: [],
        ingredients: recipe.ingredients.map(ingredient => ({ count: ingredient.count,
          choices: ingredient.choices.map(choice => ({ ...choice })) })),
        outputs: recipe.outputs.map(output => ({ ...output })),
        ...(recipe.grid ? { grid: { width: recipe.grid.width, height: recipe.grid.height, slots: [...recipe.grid.slots] } } : {}),
        sourceMetadata: {},
      };
    }),
    index: { tagMembers: {}, unresolvedTags: {} },
  };
  return parseRecipeCatalogArtifact(artifact, artifact.source);
};
