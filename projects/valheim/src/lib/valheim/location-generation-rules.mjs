// Shared by the worker request and build tools. Search and presentation data
// must never change the fingerprint of otherwise identical placement rules.
export const locationGenerationRules = (locations) => locations.map(({ id, prefabName, enabled, placement }) => ({
  id, prefabName, enabled, placement, contents: null,
}))
