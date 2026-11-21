export const MAX_PROFILE_CATALOG_LENGTH = 32_768;

interface PositionProfile {
  build: string;
  sha256: string;
  peTimestamp: number;
  namePoolRva: number;
  gameEngineRva: number;
  worldSubsystemsOffset: number;
  mapEntriesOffset: number;
  mapIdOffset: number;
  mapLayerOffset: number;
}

interface PositionProfileCatalog {
  schemaVersion: 1;
  profiles: PositionProfile[];
}

const isOffset = (value: unknown, max: number, alignment: number): boolean =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= max && value % alignment === 0;

const isPositionProfile = (value: unknown): value is PositionProfile => {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<PositionProfile>;
  return typeof profile.build === "string" && /^\d{1,12}$/.test(profile.build)
    && typeof profile.sha256 === "string" && /^[a-f0-9]{64}$/.test(profile.sha256)
    && isOffset(profile.peTimestamp, 0xffffffff, 1)
    && isOffset(profile.namePoolRva, 0x20000000, 8)
    && isOffset(profile.gameEngineRva, 0x20000000, 8)
    && isOffset(profile.worldSubsystemsOffset, 0x100000, 8)
    && isOffset(profile.mapEntriesOffset, 0x100000, 8)
    && isOffset(profile.mapIdOffset, 0x100000, 8)
    && isOffset(profile.mapLayerOffset, 0x100000, 4);
};

export const parsePositionProfileCatalog = (text: string): PositionProfileCatalog | null => {
  if (text.length > MAX_PROFILE_CATALOG_LENGTH) return null;
  try {
    const catalog = JSON.parse(text);
    if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.profiles) || catalog.profiles.length > 64
      || !catalog.profiles.every(isPositionProfile)) return null;
    const hashes = catalog.profiles.map((profile: PositionProfile) => profile.sha256);
    return new Set(hashes).size === hashes.length ? catalog : null;
  } catch {
    return null;
  }
};
