import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const markers = JSON.parse(await readFile(join(root, "src/data/generated/er-markers.json"), "utf8"));
const bosses = markers.filter((marker) => marker.category === "boss" && marker.bossMeta?.combat);
const streamedInvasions = (
  await Promise.all([
    "public/data/er-map/elden-ring/overworld/invasion.json",
    "public/data/er-map/elden-ring/underground/invasion.json",
    "public/data/er-map/elden-ring/dlc-realm-of-shadow.json",
  ].map(async (path) => JSON.parse(await readFile(join(root, path), "utf8"))))
).flat().filter((marker) => marker.category === "invasion");
const representativeNames = new Set([
  "Godrick the Grafted",
  "Dancer of Ranah",
  "Black Knight Garrew",
  "Rennala, Queen of the Full Moon",
  "Starscourge Radahn",
  "Morgott, the Omen King",
  "Fire Giant",
  "Mohg, Lord of Blood",
  "Elden Beast",
  "Malenia, Blade of Miquella",
  "Radahn, Consort of Miquella",
  "Crystalian",
]);

for (const type of ["Magic", "Fire", "Lightning", "Holy", "Standard", "Slash", "Strike", "Pierce"]) {
  const matches = bosses
    .filter((marker) => marker.bossMeta.combat.damage.some((entry) => entry.type === type && entry.mult >= 1.25))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 2);
  for (const marker of matches) representativeNames.add(marker.name);
}

const sample = [...representativeNames]
  .map((name) => bosses.find((marker) => marker.name === name))
  .filter(Boolean);
const server = await createServer({
  root,
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true },
  appType: "custom",
  logLevel: "error",
});

const failures = [];
const topCounts = new Map();
const rows = [];
let recommendBossBuild;
let recommendLinkedBossWeapons;

const recommendedItems = (result) => [
  result.weapon.item,
  ...result.alternatives.map((entry) => entry.item),
  ...result.talismans.map((entry) => entry.item),
  ...result.tears.map((entry) => entry.item),
  ...result.consumables.map((entry) => entry.item),
  ...result.bossCounters.map((entry) => entry.item),
  ...(result.spirit ? [result.spirit.item] : []),
  ...(result.ashOfWar ? [result.ashOfWar.item] : []),
  ...(result.offhand ? [result.offhand.item] : []),
  ...result.spells.flatMap((entry) => [entry.item, entry.catalyst]),
];

const buildInput = (marker, overrides = {}) => ({
  markerId: marker.id,
  npcParamId: marker.npcParamId,
  bossName: marker.name,
  bossHp: marker.bossMeta.hp,
  bossRunes: marker.bossMeta.runes,
  bossPoise: marker.bossMeta.poise,
  bossRegion: marker.region,
  bossScaleRegion: marker.bossMeta.hpScale?.region,
  combat: marker.bossMeta.combat,
  level: 100,
  style: "balanced",
  twoHanded: true,
  scadutreeLevel: marker.layer === "dlc-realm-of-shadow" ? 10 : undefined,
  spiritAshAllowed: true,
  encounterLayer: marker.layer,
  ...overrides,
});

try {
  ({ recommendBossBuild } = await server.ssrLoadModule(
    "/src/features/detail/build-advisor/recommend-build.ts",
  ));
  ({ recommendLinkedBossWeapons } = await server.ssrLoadModule(
    "/src/features/detail/build-advisor/weapon-optimizer.ts",
  ));
  const { MATCHUP_PERFORMANCE_FLOOR } = await server.ssrLoadModule(
    "/src/features/detail/build-advisor/weapon-matchup.ts",
  );
  const { canRecommendSpiritAsh } = await server.ssrLoadModule(
    "/src/features/detail/build-advisor/spirit-ash-availability.ts",
  );
  const { bossDamageMultiplier, consistentlyExploitsDamageOpportunity } = await server.ssrLoadModule(
    "/src/features/detail/build-advisor/boss-profile.ts",
  );
  const { erItems } = await server.ssrLoadModule("/src/data/er-items-data.ts");
  const {
    isItemAvailableForFirstClear,
    recommendationItemAccess,
    remembranceTradeRoute,
  } = await server.ssrLoadModule(
    "/src/data/item-acquisition.ts",
  );

  const remembranceRewards = erItems.filter((item) => remembranceTradeRoute(item)?.boss);
  if (remembranceRewards.length !== 50) {
    failures.push(`expected 50 resolved remembrance rewards, found ${remembranceRewards.length}`);
  }
  for (const item of remembranceRewards) {
    const route = remembranceTradeRoute(item);
    if (route?.boss && isItemAvailableForFirstClear(item, route.boss.markerId)) {
      failures.push(`${item.name}: available before its remembrance boss is defeated`);
    }
  }

  const cipherPata = erItems.find((item) => item.name === "Cipher Pata");
  const referenceCombat = bosses.find((marker) => marker.name === "Godrick the Grafted")?.bossMeta.combat;
  if (!cipherPata || !referenceCombat) {
    failures.push("Cipher Pata physical damage fixture is missing");
  } else {
    const [cipherRecommendation] = recommendLinkedBossWeapons(
      [`weapon:${cipherPata.id}`],
      referenceCombat,
      100,
      100,
      "balanced",
      true,
      () => ({ available: true, effort: 0 }),
    );
    if (!cipherRecommendation) {
      failures.push("Cipher Pata recommendation fixture did not resolve");
    } else {
      if (cipherRecommendation.damageParts.some((part) => part.type === "physical" && part.raw > 0)) {
        failures.push("Cipher Pata unexpectedly has physical damage");
      }
      if (cipherRecommendation.attackTypes.length > 0) {
        failures.push("Cipher Pata exposes inactive physical attack types");
      }
    }
  }

  const acquisitionChecks = [
    { item: "Buckler", boss: "Godrick the Grafted", available: true, routeKind: "merchant" },
    { item: "Academy Magic Pot", boss: "Malenia, Blade of Miquella", available: true, routeKind: "crafting" },
    { item: "Shard of Alexander", boss: "Malenia, Blade of Miquella", available: false },
    { item: "Grave Scythe", boss: "Malenia, Blade of Miquella", available: false },
    { item: "Hand of Malenia", boss: "Malenia, Blade of Miquella", available: false },
  ];
  for (const check of acquisitionChecks) {
    const item = erItems.find((candidate) => candidate.name === check.item);
    const boss = bosses.find((candidate) => candidate.name === check.boss);
    if (!item || !boss) {
      failures.push(`Acquisition fixture is missing: ${check.item} / ${check.boss}`);
      continue;
    }
    const access = recommendationItemAccess(item, boss.id);
    if (access.available !== check.available) {
      failures.push(`${check.item}: expected available=${check.available} against ${check.boss}`);
    }
    if (check.routeKind && access.routeKind !== check.routeKind) {
      failures.push(`${check.item}: expected ${check.routeKind} route, found ${access.routeKind ?? "none"}`);
    }
  }

  for (const marker of sample) {
    const combat = marker.bossMeta.combat;
    const result = recommendBossBuild(buildInput(marker));
    if (!result) {
      failures.push(`${marker.name}: no recommendation`);
      continue;
    }

    const weaponName = result.weapon.item.name;
    topCounts.set(weaponName, (topCounts.get(weaponName) ?? 0) + 1);
    if (marker.bossMeta.poise > 0) {
      const staggerPlan = result.weapon.staggerPlan;
      if (!staggerPlan) {
        failures.push(`${marker.name}: recommended weapon has no stagger plan`);
      } else {
        if (staggerPlan.bossStance !== marker.bossMeta.poise) {
          failures.push(`${marker.name}: stagger plan uses the wrong boss stance pool`);
        }
        for (const move of staggerPlan.moves) {
          const expectedAttacks = Math.ceil(staggerPlan.bossStance / move.stanceDamage);
          if (move.stanceDamage <= 0 || move.attacksToBreak !== expectedAttacks) {
            failures.push(`${marker.name}: ${move.key} has an invalid stagger estimate`);
          }
        }
        if (!staggerPlan.moves.some((move) => move.key === staggerPlan.bestMove.key)) {
          failures.push(`${marker.name}: best stagger move is missing from the move list`);
        }
        const fewestAttacks = Math.min(...staggerPlan.moves.map((move) => move.attacksToBreak));
        if (staggerPlan.bestMove.attacksToBreak !== fewestAttacks) {
          failures.push(`${marker.name}: stagger plan does not lead with the shortest ideal sequence`);
        }
      }
    }
    const unavailable = recommendedItems(result).filter((item) => (
      !recommendationItemAccess(item, marker.id).available
    ));
    if (unavailable.length > 0) {
      failures.push(`${marker.name}: recommends inaccessible ${unavailable.map((item) => item.name).join(", ")}`);
    }
    if (result.ashOfWar && (
      result.ashOfWar.item.icon_id <= 0
      || /\b(?:dummy|placeholder)\b/i.test(result.ashOfWar.item.name)
    )) {
      failures.push(`${marker.name}: recommends placeholder Ash of War ${result.ashOfWar.item.name}`);
    }

    if (
      marker.name === "Malenia, Blade of Miquella"
      && recommendedItems(result).some((item) => item.name === "Hand of Malenia")
    ) {
      failures.push(`${marker.name}: recommends Hand of Malenia before the first clear`);
    }
    const statusShare = result.weapon.statusScore / Math.max(1, result.weapon.fitScore);
    if (statusShare > 0.17) failures.push(`${marker.name}: status share exceeds the 16% cap`);
    if (result.progression.weaponPerformanceRatio < MATCHUP_PERFORMANCE_FLOOR) {
      failures.push(`${marker.name}: matchup selection fell below its performance floor`);
    }
    const choices = [result.weapon, ...result.alternatives];
    const subtypes = choices.map((entry) => entry.item.subtype);
    if (new Set(subtypes).size !== subtypes.length) {
      failures.push(`${marker.name}: alternatives repeat the same weapon class`);
    }
    const opaqueDetails = [
      ...result.talismans,
      ...result.tears,
      ...result.consumables,
      ...(result.offhand ? [result.offhand] : []),
    ].filter((entry) => /(?:guard )?fit$/i.test(entry.detail ?? ""));
    if (opaqueDetails.length > 0) {
      failures.push(`${marker.name}: exposes internal support fit scores`);
    }

    const elementalWeaknesses = combat.damage.filter(
      (entry) => ["Magic", "Fire", "Lightning", "Holy"].includes(entry.type) && entry.mult >= 1.25,
    );
    const strongestPhysicalMultiplier = Math.max(
      1,
      ...combat.damage
        .filter((entry) => ["Standard", "Slash", "Strike", "Pierce"].includes(entry.type))
        .map((entry) => entry.mult),
    );
    if (
      elementalWeaknesses.some((entry) => entry.mult > strongestPhysicalMultiplier)
      && !result.weapon.damageParts.some((part) => elementalWeaknesses.some(
        (weakness) => weakness.type.toLowerCase() === part.type && part.multiplier >= 1.1,
      ))
    ) {
      failures.push(`${marker.name}: top build ignores a major elemental weakness`);
    }

    const elementalBest = Math.max(1, ...elementalWeaknesses.map((entry) => entry.mult));
    const physicalWeaknesses = combat.damage.filter(
      (entry) => ["Standard", "Slash", "Strike", "Pierce"].includes(entry.type) && entry.mult >= elementalBest,
    );
    const weaponChoices = [result.weapon, ...result.alternatives];
    if (
      physicalWeaknesses.length > 0
      && !weaponChoices.some((weapon) => weapon.attackTypes.some(
        (type) => physicalWeaknesses.some((weakness) => weakness.type === type),
      ))
    ) {
      failures.push(`${marker.name}: recommendations omit its strongest physical weakness`);
    }

    rows.push({
      boss: marker.name,
      weapon: weaponName,
      affinity: result.weapon.affinity,
      direct: Math.round(result.weapon.directScore),
      status: Math.round(result.weapon.statusScore),
      upgrade: result.weapon.upgrade,
      progression: `${result.progression.levelMin}-${result.progression.levelMax}`,
      counters: result.bossCounters.map((entry) => entry.item.name).join(", ") || "None",
    });
  }

  const starscourgeRadahn = bosses.find((marker) => marker.name === "Starscourge Radahn");
  if (!starscourgeRadahn) {
    failures.push("Starscourge Radahn fixture is missing");
  } else {
    const recommendation = recommendBossBuild(buildInput(starscourgeRadahn));
    const combat = starscourgeRadahn.bossMeta.combat;
    const purePierce = bossDamageMultiplier(combat, "Physical", ["Pierce"]);
    const mixedPierce = bossDamageMultiplier(combat, "Physical", ["Standard", "Pierce"]);
    const pureStandard = bossDamageMultiplier(combat, "Physical", ["Standard"]);
    if (!(purePierce > mixedPierce && mixedPierce > pureStandard)) {
      failures.push("Starscourge Radahn: mixed physical movesets receive full Pierce value");
    }
    if (!recommendation) {
      failures.push("Starscourge Radahn: recommendation must resolve");
    } else {
      const weaponChoices = [recommendation.weapon, ...recommendation.alternatives];
      if (!weaponChoices.some((weapon) => (
        weapon.attackTypes.length === 1 && weapon.attackTypes[0] === "Pierce"
      ))) {
        failures.push("Starscourge Radahn: recommendation omits a competitive pure-Pierce option");
      }
      const tinyLightningSplit = {
        ...recommendation.weapon,
        damageParts: [
          { type: "physical", raw: 500, adjusted: 500, multiplier: 1 },
          { type: "lightning", raw: 5, adjusted: 6.25, multiplier: 1.25 },
        ],
      };
      if (consistentlyExploitsDamageOpportunity(tinyLightningSplit, {
        types: new Set(["lightning"]),
        multiplier: 1.25,
        meaningful: true,
      })) {
        failures.push("A negligible elemental split incorrectly counts as exploiting a weakness");
      }
    }
  }

  const ulceratedTreeSpirit = bosses.find((marker) => marker.id === "er-boss-18000800");
  if (!ulceratedTreeSpirit) {
    failures.push("Ulcerated Tree Spirit fixture is missing");
  } else {
    const recommendation = recommendBossBuild(buildInput(ulceratedTreeSpirit));
    if (!recommendation) {
      failures.push("Ulcerated Tree Spirit: recommendation must resolve");
    } else {
      if (recommendation.weapon.stats.end > 25) {
        failures.push("Ulcerated Tree Spirit: endurance target exceeds the practical cap");
      }
      if (recommendation.weapon.stats.mind > 22) {
        failures.push("Ulcerated Tree Spirit: mind target exceeds the practical cap");
      }
      if ("armor" in recommendation) {
        failures.push("Ulcerated Tree Spirit: exact armor prescriptions returned");
      }
      if (!recommendation.weapon.damageParts.some((part) => part.type === "fire" && part.multiplier >= 1.1)) {
        failures.push("Ulcerated Tree Spirit: recommendation ignores its fire weakness");
      }
      const forbiddenEarlyItems = new Set(["Grave Scythe", "Mantis Blade", "Hand of Malenia"]);
      for (const itemName of forbiddenEarlyItems) {
        const item = erItems.find((candidate) => candidate.name === itemName);
        if (item && recommendationItemAccess(item, ulceratedTreeSpirit.id).available) {
          failures.push(`Ulcerated Tree Spirit: ${itemName} incorrectly enters the easy-to-get pool`);
        }
      }
      if (recommendation.bossCounters.length > 2) {
        failures.push("Ulcerated Tree Spirit: recommendation returns more than two boss counters");
      }
      const forbidden = recommendedItems(recommendation).filter((item) => forbiddenEarlyItems.has(item.name));
      if (forbidden.length > 0) {
        failures.push(`Ulcerated Tree Spirit: recommends ${forbidden.map((item) => item.name).join(", ")}`);
      }
    }
  }

  const snowfieldPutridAvatar = bosses.find((marker) => (
    marker.name === "Putrid Avatar" && marker.region === "Consecrated Snowfield"
  ));
  if (!snowfieldPutridAvatar) {
    failures.push("Snowfield Putrid Avatar fixture is missing");
  } else {
    const recommendation = recommendBossBuild(buildInput(snowfieldPutridAvatar));
    if (!recommendation) {
      failures.push("Snowfield Putrid Avatar: recommendation must resolve");
    } else {
      if (recommendation.progression.levelMin !== 100 || recommendation.progression.levelMax !== 120) {
        failures.push("Snowfield Putrid Avatar: expected progression is not RL 100-120");
      }
      if (recommendation.progression.status !== "meets") {
        failures.push("Snowfield Putrid Avatar: RL 100 build does not meet the expected progression baseline");
      }
      const counterNames = new Set(recommendation.bossCounters.map((entry) => entry.item.name));
      if (!counterNames.has("Preserving Boluses") && !counterNames.has("Flame, Cleanse Me")) {
        failures.push("Snowfield Putrid Avatar: Scarlet Rot counter is missing");
      }
    }
  }

  for (const encounter of ["Wormface", "Lichdragon Fortissax"]) {
    const marker = bosses.find((candidate) => candidate.name === encounter);
    const result = marker ? recommendBossBuild(buildInput(marker)) : null;
    if (!marker || !result) {
      failures.push(`${encounter}: fixture or recommendation is missing`);
    } else if (!result.bossCounters.some((entry) => entry.item.name === "Rejuvenating Boluses")) {
      failures.push(`${encounter}: Death Blight counter is missing`);
    }
  }

  const goldenShade = bosses.find((marker) => marker.id === "er-boss-11000850");
  const goldenShadeBuild = goldenShade ? recommendBossBuild(buildInput(goldenShade)) : null;
  if (!goldenShadeBuild
    || goldenShadeBuild.progression.levelMin !== 80
    || goldenShadeBuild.progression.levelMax !== 100) {
    failures.push("Golden Shade Godfrey: progression leaked from the endgame namesake");
  }

  const dancer = bosses.find((marker) => marker.name === "Dancer of Ranah");
  const consort = bosses.find((marker) => marker.name === "Radahn, Consort of Miquella");
  const dancerBuild = dancer ? recommendBossBuild(buildInput(dancer)) : null;
  const consortBuild = consort ? recommendBossBuild(buildInput(consort)) : null;
  if (!dancerBuild?.progression.targetScadutree
    || !consortBuild?.progression.targetScadutree
    || dancerBuild.progression.targetScadutree >= consortBuild.progression.targetScadutree) {
    failures.push("DLC progression does not distinguish an early encounter from the final boss");
  }

  const summonFixture = bosses.find((marker) => marker.name === "Morgott, the Omen King");
  if (!summonFixture) {
    failures.push("Spirit Ash availability fixture is missing");
  } else {
    for (const category of ["evergaol-boss", "invasion"]) {
      const spiritAshAllowed = canRecommendSpiritAsh(category, "boss:test");
      if (spiritAshAllowed) failures.push(`${category}: Spirit Ash policy is unexpectedly enabled`);
      const result = recommendBossBuild(buildInput(summonFixture, { spiritAshAllowed }));
      if (result?.spirit) failures.push(`${category}: recommends a Spirit Ash`);
    }
    if (!canRecommendSpiritAsh("great-boss", "boss:test")) {
      failures.push("great-boss: Spirit Ash policy is unexpectedly disabled");
    }
    if (!canRecommendSpiritAsh("evergaol-boss", "boss:1044350800")) {
      failures.push("Bloodhound Knight Darriwil: uncertain Spirit Ash option was hidden");
    }

    for (const invasion of streamedInvasions) {
      const encounterLayer = invasion.areaNo === "61"
        ? "dlc-realm-of-shadow"
        : invasion.areaNo === "12" ? "underground" : "overworld";
      const streamedInvasion = recommendBossBuild(buildInput(summonFixture, {
        markerId: invasion.id,
        bossName: invasion.name,
        bossRegion: invasion.region,
        bossScaleRegion: undefined,
        encounterLayer,
        spiritAshAllowed: false,
      }));
      if (!streamedInvasion) failures.push(`${invasion.name} invasion: no recommendation`);
      if (streamedInvasion?.spirit) failures.push(`${invasion.name} invasion: recommends a Spirit Ash`);
    }
  }

} finally {
  await server.close();
}

const [mostCommonWeapon, mostCommonCount] = [...topCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
if (mostCommonCount / Math.max(1, rows.length) > 0.4) {
  failures.push(`${mostCommonWeapon}: top pick for ${mostCommonCount}/${rows.length} representative bosses`);
}

const progressionNames = ["Margit, the Fell Omen", "Starscourge Radahn", "Malenia, Blade of Miquella"];
const progression = progressionNames.map((name) => {
  const marker = bosses.find((candidate) => candidate.name === name);
  if (!marker) return null;
  return recommendBossBuild(buildInput(marker));
});
if (progression.some((result) => !result)) {
  failures.push("Encounter progression fixtures did not all resolve");
} else {
  const [margit, radahn, malenia] = progression;
  if (!(margit.progression.levelMin < radahn.progression.levelMin
    && radahn.progression.levelMin < malenia.progression.levelMin)) {
    failures.push("Expected progression does not scale from Margit to Radahn to Malenia");
  }
  if (!(margit.progression.upgradeMin < radahn.progression.upgradeMin
    && radahn.progression.upgradeMin < malenia.progression.upgradeMin)) {
    failures.push("Expected weapon upgrades do not scale with encounter pressure");
  }
}

const malenia = bosses.find((marker) => marker.name === "Malenia, Blade of Miquella");
if (malenia) {
  const belowProgression = recommendBossBuild(buildInput(malenia, { level: 40 }));
  if (belowProgression?.progression.status !== "below") {
    failures.push("Malenia at RL 40 does not surface a progression warning");
  }
}

console.table(rows);
if (failures.length > 0) {
  console.error(`Build advisor audit failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Build advisor audit passed for ${rows.length} representative bosses.`);
}
