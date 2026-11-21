const numericParts = (version: string): number[] | null => {
  if (!/^\d+(?:\.\d+)*$/.test(version)) return null;
  const parts = version.split(".").map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
};

/** Compare numeric release components without assuming a fixed component count. */
export const compareWorldVersions = (left: string, right: string): number | null => {
  const a = numericParts(left), b = numericParts(right);
  if (!a || !b) return null;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
};

/** The map profile is independent of the running game's reported release. */
export const latestWorldVersion = (available: readonly string[]): string | null => available.reduce<string | null>(
  (latest, version) => latest === null || (compareWorldVersions(version, latest) ?? 0) > 0 ? version : latest,
  null,
);
