import raw from "../../../data/generated/er-weapon-advisor.json";

export interface WeaponProfile {
  id: number;
  baseId: number;
  affinity: string;
  affinityIndex: number;
  attackTypes: string[];
  buildup: { type: string; value: number }[];
  wepType: number;
  swordArtsParamId: number;
  gemMountType: number;
  stance?: {
    oneHanded: StanceMoveProfile[];
    twoHanded: StanceMoveProfile[];
    upgradeRates?: number[];
  };
  guard: Record<"physical" | "magic" | "fire" | "lightning" | "holy" | "boost", number>;
}

export interface StanceMoveProfile {
  key: "light" | "heavy" | "chargedHeavy" | "jumpHeavy" | "guardCounter";
  damage: number;
  hits: number;
}

export interface AshProfile {
  itemId: number;
  swordArtsParamId: number;
  defaultAffinity: number;
  affinities: number[];
  weaponTypes: number[];
}

export interface BossAttackProfile {
  name: string;
  damage: { type: string; weight: number }[];
  status: { type: string; buildup: number }[];
}

interface Curve {
  values: number[];
  growth: number[];
  adjustments: number[];
}

interface AdvisorData {
  profiles: WeaponProfile[];
  ashes: AshProfile[];
  bossProfiles: Record<string, BossAttackProfile>;
  bossNpcByMarker: Record<string, number>;
  equipLoad: Curve | null;
  resources: { hp: Curve | null; fp: Curve | null; stamina: Curve | null };
  scadutree: { level: number; attack: number; damageTaken: number }[];
  dlcBossMarkers: string[];
  specialCandidates: Record<string, { itemKey: string; score: number }[]>;
}

const data = raw as AdvisorData;

export const weaponProfiles = data.profiles;

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (value: string) => new Set(normalize(value).split(" ").filter((word) => word.length > 2));
const generatedMarkerId = (markerId: string): string =>
  markerId.startsWith("boss:") ? `er-boss-${markerId.slice("boss:".length)}` : markerId;

export const resolveBossAttackProfile = (
  markerId: string,
  npcParamId: number | undefined,
  bossName: string,
): BossAttackProfile | undefined => {
  const exactId = npcParamId ?? data.bossNpcByMarker[generatedMarkerId(markerId)];
  if (exactId && data.bossProfiles[exactId]) return data.bossProfiles[exactId];

  const wanted = words(bossName);
  let best: { profile: BossAttackProfile; score: number } | undefined;
  for (const profile of Object.values(data.bossProfiles)) {
    const candidate = words(profile.name.replace(/\s*\([^)]*\)\s*/g, " "));
    let overlap = 0;
    for (const word of wanted) if (candidate.has(word)) overlap += 1;
    const score = overlap / Math.max(wanted.size, candidate.size, 1);
    if (score > (best?.score ?? 0)) best = { profile, score };
  }
  return best && best.score >= 0.5 ? best.profile : undefined;
};

const curveAt = (curve: Curve, value: number): number => {
  const clamped = Math.max(curve.values[0], Math.min(value, curve.values.at(-1) ?? value));
  for (let index = 0; index < curve.values.length - 1; index += 1) {
    const low = curve.values[index];
    const high = curve.values[index + 1];
    if (clamped > high) continue;
    const ratio = high > low ? (clamped - low) / (high - low) : 0;
    const adjustment = curve.adjustments[index] || 1;
    const shaped = adjustment > 0
      ? ratio ** adjustment
      : 1 - (1 - ratio) ** Math.abs(adjustment);
    return curve.growth[index] + (curve.growth[index + 1] - curve.growth[index]) * shaped;
  }
  return curve.growth.at(-1) ?? 0;
};

export const maxEquipLoad = (endurance: number): number =>
  data.equipLoad ? curveAt(data.equipLoad, endurance) : 0;

export const resourceValue = (resource: "hp" | "fp" | "stamina", stat: number): number => {
  const curve = data.resources[resource];
  return curve ? curveAt(curve, stat) : 0;
};

export const scadutreeEffect = (level: number) =>
  data.scadutree.find((entry) => entry.level === level) ?? data.scadutree[0];

const dlcBossMarkerIds = new Set(data.dlcBossMarkers);
export const isDlcBoss = (markerId: string): boolean =>
  dlcBossMarkerIds.has(generatedMarkerId(markerId));

export const compatibleAshes = (weapon: WeaponProfile): AshProfile[] => {
  if (weapon.gemMountType <= 0) return [];
  return data.ashes.filter(
    (ash) => ash.weaponTypes.includes(weapon.wepType) && ash.affinities.includes(weapon.affinityIndex),
  );
};

export const specialCandidateKeys = (markerId: string): string[] =>
  (data.specialCandidates[generatedMarkerId(markerId)] ?? []).map((entry) => entry.itemKey);
