/** Keep source spelling in provenance while joining equivalent potion identities. */
export const normalizeBrewingId = (id, aliases) => {
  const separator = id.lastIndexOf("/");
  if (separator < 0) return id;
  const variant = id.slice(separator + 1);
  if (!/[A-Z]/.test(variant)) return id;
  const normalized = aliases[variant];
  if (!normalized) throw new Error(`Unknown brewing potion alias: ${variant}`);
  return `${id.slice(0, separator + 1)}${normalized}`;
};
