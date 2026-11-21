const exactName = (value) => (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");

// Search normalization is not identity: punctuation can distinguish two items.
// A name-only fallback may resolve a unique item, never every colliding item.
export const selectAcquisitionNameMatches = (candidates, names) => {
  const unique = [...new Map(candidates.map((item) => [item.id, item])).values()];
  const requested = new Set(names.map(exactName).filter(Boolean));
  const exact = unique.filter((item) => Object.values(item.localizedNames ?? {}).some((name) => requested.has(exactName(name))));
  const matches = exact.length ? exact : unique;
  return matches.length === 1 ? matches : [];
};
