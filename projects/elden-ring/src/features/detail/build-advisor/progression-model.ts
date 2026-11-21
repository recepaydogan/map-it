import type { BuildStyle, ProgressionAssessment, WeaponRecommendation } from "./types";

export interface ProgressionProfile {
  pressure: number;
  levelMin: number;
  levelMax: number;
  targetVigor: number;
  regularUpgradeMin: number;
  regularUpgradeMax: number;
  targetScadutree?: number;
  confidence: ProgressionAssessment["confidence"];
}

interface ProgressionInput {
  hp?: number;
  runes?: number;
  poise?: number;
  isDlc: boolean;
  style: BuildStyle;
  region?: string;
  scaleRegion?: string;
}

interface ProgressionBand {
  levelMin: number;
  levelMax: number;
  targetVigor: number;
  regularUpgradeMin: number;
  regularUpgradeMax: number;
}

const band = (
  levelMin: number,
  levelMax: number,
  targetVigor: number,
  regularUpgradeMin: number,
  regularUpgradeMax: number,
): ProgressionBand => ({
  levelMin,
  levelMax,
  targetVigor,
  regularUpgradeMin,
  regularUpgradeMax,
});

// Exact labels emitted by the marker and HP-scaling pipelines. Name fragments
// are intentionally absent: two bosses sharing a title do not share progression.
const PROGRESSION_BY_REGION = new Map<string, ProgressionBand>([
  ["Agheel Lake North", band(20, 40, 20, 0, 6)],
  ["Limgrave", band(20, 40, 20, 0, 6)],
  ["Misc. Limgrave", band(20, 40, 20, 0, 6)],
  ["Stormveil Castle", band(20, 40, 20, 0, 6)],
  ["Weeping Peninsula", band(20, 40, 20, 0, 6)],
  ["Ainsel River", band(40, 60, 25, 4, 12)],
  ["Liurnia", band(40, 60, 25, 4, 12)],
  ["Liurnia / Caria Manor / Academy", band(40, 60, 25, 4, 12)],
  ["Siofra River", band(40, 60, 25, 4, 12)],
  ["Caelid", band(60, 80, 30, 10, 16)],
  ["Nokron, Eternal City", band(60, 80, 30, 10, 16)],
  ["Redmane Castle", band(60, 80, 30, 10, 16)],
  ["Ainsel River, Nokstella", band(80, 100, 35, 15, 20)],
  ["Altus Plateau", band(70, 90, 35, 12, 18)],
  ["Capital Outskirts", band(80, 100, 35, 15, 20)],
  ["Deeproot Depths", band(80, 100, 35, 15, 20)],
  ["Lake of Rot", band(80, 100, 35, 15, 20)],
  ["Mt. Gelmir", band(80, 100, 35, 15, 20)],
  ["Mt. Gelmir / Capital Outskirts / Nokron", band(80, 100, 35, 15, 20)],
  ["Volcano Manor / Deeproot Depths / Nokstella", band(80, 100, 35, 15, 20)],
  ["Dragonbarrow", band(90, 110, 40, 17, 21)],
  ["Dragonbarrow / Ashen Capital", band(100, 120, 45, 20, 24)],
  ["Leyndell", band(90, 110, 40, 17, 21)],
  ["Leyndell / SE Caelid", band(90, 110, 40, 17, 21)],
  ["Mohgwyn Palace", band(110, 140, 45, 22, 24)],
  ["Moonlight Altar / Leyndell Sewers", band(90, 110, 40, 17, 21)],
  ["Mountaintops", band(100, 120, 40, 20, 24)],
  ["Mountaintops of the Giants", band(100, 120, 40, 20, 24)],
  ["Consecrated Snowfield", band(100, 120, 40, 20, 24)],
  ["Farum Azula", band(120, 150, 50, 24, 25)],
  ["Haligtree Roots", band(120, 150, 50, 24, 25)],
  ["Malenia", band(120, 150, 50, 24, 25)],
  ["South of Minor Erdtree", band(120, 150, 50, 24, 25)],
  ["Cerulean Coast", band(120, 150, 50, 25, 25)],
  ["Charo's Hidden Grave", band(120, 150, 50, 25, 25)],
  ["Ellac River", band(120, 150, 50, 25, 25)],
  ["Foot of the Jagged Peak", band(120, 150, 50, 25, 25)],
  ["Gravesite Plain", band(120, 150, 50, 25, 25)],
  ["Scadu Altus", band(140, 160, 50, 25, 25)],
  ["Shadow Keep / Stone Coffin Fissure", band(140, 160, 50, 25, 25)],
  ["Jagged Peak", band(140, 160, 50, 25, 25)],
  ["Rauh Base", band(150, 170, 50, 25, 25)],
  ["Rauh Base / Charo's Hidden Grave", band(150, 170, 50, 25, 25)],
  ["Scaduview", band(150, 170, 50, 25, 25)],
  ["Abyssal Woods / Hinterland", band(150, 170, 50, 25, 25)],
  ["Ancient Ruins of Rauh", band(150, 170, 50, 25, 25)],
  ["Finger Birthing Grounds / Jagged Peak / Enir-Ilim", band(160, 180, 50, 25, 25)],
  ["Scadutree Base", band(160, 180, 50, 25, 25)],
]);

const clamp = (value: number, minimum = 0, maximum = 1): number =>
  Math.min(maximum, Math.max(minimum, value));

const logSignal = (value: number | undefined, minimum: number, maximum: number): number | undefined => {
  if (!value || value <= 0) return undefined;
  return clamp((Math.log(value) - Math.log(minimum)) / (Math.log(maximum) - Math.log(minimum)));
};

const linearSignal = (value: number | undefined, minimum: number, maximum: number): number | undefined => {
  if (!value || value <= 0) return undefined;
  return clamp((value - minimum) / (maximum - minimum));
};

/** Typical first-clear upgrade progression, scaled for regular (+25) and somber (+10) weapons. */
export const upgradeForRuneLevel = (level: number, maximum: number): number => {
  const regularUpgrade = clamp(
    Math.round(level / 10 + Math.max(0, level - 40) / 5.5),
    0,
    25,
  );
  return Math.min(maximum, Math.round(regularUpgrade * maximum / 25));
};

const upgradeForBand = (regularUpgrade: number, maximum: number): number =>
  Math.min(maximum, Math.round(regularUpgrade * maximum / 25));

const encounterPressure = ({ hp, runes, poise, isDlc }: ProgressionInput): number => {
  const signals = [
    { value: logSignal(hp, 3_000, 45_000), weight: 0.4 },
    { value: logSignal(runes, 5_000, 500_000), weight: 0.45 },
    { value: linearSignal(poise, 40, 200), weight: 0.07 },
  ].filter((signal): signal is { value: number; weight: number } => signal.value != null);
  const knownWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const measured = knownWeight > 0
    ? signals.reduce((sum, signal) => sum + signal.value * signal.weight, 0) / knownWeight
    : 0.45;
  return clamp(measured * 0.92 + (isDlc ? 0.08 : 0));
};

export const progressionProfileFor = (input: ProgressionInput): ProgressionProfile => {
  const pressure = encounterPressure(input);
  // Rune rewards are the game's clearest encounter-tier signal. Their economy
  // grows non-linearly, so squaring the normalized log signal separates early,
  // mid and late-game encounters without matching boss names. HP/poise pressure
  // remains the fallback for encounters whose reward is absent.
  const progressionSignal = logSignal(input.runes, 5_000, 500_000) ?? pressure;
  const estimatedLevel = Math.round(20 + progressionSignal ** 2 * 130);
  const knownBand = [input.region, input.scaleRegion]
    .flatMap((region) => {
      const candidate = PROGRESSION_BY_REGION.get(region ?? "");
      return candidate ? [candidate] : [];
    })
    .sort((left, right) => {
      const leftCenter = (left.levelMin + left.levelMax) / 2;
      const rightCenter = (right.levelMin + right.levelMax) / 2;
      return Math.abs(leftCenter - estimatedLevel) - Math.abs(rightCenter - estimatedLevel);
    })[0];
  const estimatedUpgrade = upgradeForRuneLevel(estimatedLevel, 25);
  const fallbackMinimum = input.isDlc ? 120 : 1;
  const levelMin = knownBand?.levelMin
    ?? Math.max(fallbackMinimum, Math.round((estimatedLevel - 10) / 5) * 5);
  const levelMax = knownBand?.levelMax
    ?? Math.min(300, Math.max(levelMin + 20, Math.round((estimatedLevel + 10) / 5) * 5));
  const styleVigor = input.style === "survival" ? 4 : 0;

  return {
    pressure,
    levelMin,
    levelMax,
    targetVigor: Math.min(60, (knownBand?.targetVigor ?? Math.round(18 + Math.max(0, estimatedLevel - 20) * 0.32)) + styleVigor),
    regularUpgradeMin: knownBand?.regularUpgradeMin ?? Math.max(0, estimatedUpgrade - 2),
    regularUpgradeMax: knownBand?.regularUpgradeMax ?? Math.min(25, estimatedUpgrade + 2),
    targetScadutree: input.isDlc
      ? Math.round(clamp(4 + Math.max(0, pressure - 0.5) * 24, 4, 16))
      : undefined,
    confidence: knownBand ? "high" : "estimated",
  };
};

export const performanceFloorFor = (profile: ProgressionProfile, level: number): number => {
  const underlevelGap = clamp((profile.levelMin - level) / Math.max(20, profile.levelMin * 0.5));
  const overlevelGap = clamp((level - profile.levelMax) / Math.max(20, profile.levelMax * 0.5));
  return clamp(
    0.78 + profile.pressure * 0.1 + underlevelGap * 0.04 - overlevelGap * 0.06,
    0.75,
    0.9,
  );
};

export const assessProgression = ({
  profile,
  weapon,
  level,
  scadutreeLevel,
  weaponPerformanceRatio,
}: {
  profile: ProgressionProfile;
  weapon: WeaponRecommendation;
  level: number;
  scadutreeLevel?: number;
  weaponPerformanceRatio: number;
}): ProgressionAssessment => {
  const upgradeMin = upgradeForBand(profile.regularUpgradeMin, weapon.maxUpgrade);
  const upgradeMax = upgradeForBand(profile.regularUpgradeMax, weapon.maxUpgrade);
  const performanceFloor = performanceFloorFor(profile, level);
  const gaps: ProgressionAssessment["gaps"] = [];
  if (level < profile.levelMin) gaps.push("level");
  if (weapon.stats.vig < profile.targetVigor) gaps.push("vigor");
  if (weapon.upgrade < upgradeMin) gaps.push("upgrade");
  if (profile.targetScadutree != null && (scadutreeLevel ?? 0) < profile.targetScadutree) gaps.push("scadutree");
  if (weaponPerformanceRatio < performanceFloor) gaps.push("damage");

  return {
    status: gaps.length > 0 ? "below" : "meets",
    confidence: profile.confidence,
    levelMin: profile.levelMin,
    levelMax: profile.levelMax,
    targetVigor: profile.targetVigor,
    upgradeMin,
    upgradeMax,
    targetScadutree: profile.targetScadutree,
    performanceFloor,
    weaponPerformanceRatio,
    gaps,
  };
};
