import { readPinnedJsonSource } from "./pinned-json-source.mjs";

/** Select only recipe/tag JSON blobs from an immutable tree; never download resource-pack artwork. */
export const readRecipeFileSource = async source => ({ archiveSha256: null, files: await readPinnedJsonSource(source,
  [source.recipePrefix, ...(source.tagPrefix ? [source.tagPrefix] : [])], "Recipe") });
