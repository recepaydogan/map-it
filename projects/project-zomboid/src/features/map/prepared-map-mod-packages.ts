import type { PreparedMapMod } from "./prepared-map-mod-types";

export interface PreparedMapModPackage {
  key: string;
  displayName: string;
  mods: PreparedMapMod[];
}

const groupingKeyOf = (mod: PreparedMapMod) => mod.workshopId
  ? `workshop:${mod.workshopId}`
  : `mod:${mod.key}`;

const publicPackageKey = (mods: PreparedMapMod[]) => mods.length > 1 && mods[0].workshopId
  ? `workshop:${mods[0].workshopId}`
  : `mod:${mods[0].key}`;

const packageDisplayName = (mods: PreparedMapMod[]) => {
  if (mods.length === 1) return mods[0].displayName;
  const [firstPrefix] = mods[0].displayName.split(/\s+-\s+/, 1);
  if (firstPrefix && mods.every(({ displayName }) => displayName.startsWith(`${firstPrefix} - `))) {
    return firstPrefix;
  }
  return mods[0].displayName;
};

/** A Workshop item is one user-facing package even when it contains several map mods. */
export const createPreparedMapModPackages = (mods: PreparedMapMod[]): PreparedMapModPackage[] => {
  const grouped = new Map<string, PreparedMapMod[]>();
  for (const mod of mods) {
    const key = groupingKeyOf(mod);
    const packageMods = grouped.get(key);
    if (packageMods) packageMods.push(mod);
    else grouped.set(key, [mod]);
  }
  return [...grouped].map(([, packageMods]) => ({
    key: publicPackageKey(packageMods),
    displayName: packageDisplayName(packageMods),
    mods: packageMods,
  }));
};

/** Partial packages become fully active; fully active packages are disabled together. */
export const togglePreparedMapModPackage = (
  activeKeys: string[],
  packageModKeys: string[],
) => {
  const nextKeys = new Set(activeKeys);
  const uniquePackageKeys = [...new Set(packageModKeys)];
  const activating = !uniquePackageKeys.every((key) => nextKeys.has(key));
  for (const key of uniquePackageKeys) {
    if (activating) nextKeys.add(key);
    else nextKeys.delete(key);
  }
  return { activeKeys: [...nextKeys], activating };
};
