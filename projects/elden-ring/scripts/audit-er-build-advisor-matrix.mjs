import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { promisify } from "node:util";
import { createServer } from "vite";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const markers = JSON.parse(await readFile(join(root, "src/data/generated/er-markers.json"), "utf8"));
const bosses = markers.filter((marker) => marker.category === "boss" && marker.bossMeta?.combat);

const scenarios = [
  { key: "rl30-damage-2h", level: 30, style: "damage", twoHanded: true },
  { key: "rl30-survival-1h", level: 30, style: "survival", twoHanded: false },
  { key: "rl60-balanced-2h", level: 60, style: "balanced", twoHanded: true },
  { key: "rl100-damage-2h", level: 100, style: "damage", twoHanded: true },
  { key: "rl100-balanced-2h", level: 100, style: "balanced", twoHanded: true },
  { key: "rl100-balanced-1h", level: 100, style: "balanced", twoHanded: false },
  { key: "rl100-survival-2h", level: 100, style: "survival", twoHanded: true },
  { key: "rl150-damage-2h", level: 150, style: "damage", twoHanded: true },
  { key: "rl150-survival-1h", level: 150, style: "survival", twoHanded: false },
];

const buildInput = (marker, scenario) => ({
  markerId: marker.id,
  npcParamId: marker.npcParamId,
  bossName: marker.name,
  bossHp: marker.bossMeta.hp,
  bossRunes: marker.bossMeta.runes,
  bossPoise: marker.bossMeta.poise,
  bossRegion: marker.region,
  bossScaleRegion: marker.bossMeta.hpScale?.region,
  combat: marker.bossMeta.combat,
  level: scenario.level,
  style: scenario.style,
  twoHanded: scenario.twoHanded,
  scadutreeLevel: marker.layer === "dlc-realm-of-shadow" ? 10 : undefined,
  spiritAshAllowed: true,
  encounterLayer: marker.layer,
});

const runWorker = async (scenario) => {
  const server = await createServer({
    root,
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true },
    appType: "custom",
    logLevel: "error",
  });
  const failures = [];
  const recommendations = [];

  try {
    const { recommendBossBuild } = await server.ssrLoadModule(
      "/src/features/detail/build-advisor/recommend-build.ts",
    );
    const { MATCHUP_PERFORMANCE_FLOOR } = await server.ssrLoadModule(
      "/src/features/detail/build-advisor/weapon-matchup.ts",
    );
    const { requirements } = await server.ssrLoadModule("/src/data/er-ar.ts");
    const { erClasses, levelForBuild } = await server.ssrLoadModule("/src/data/er-reference.ts");
    const { recommendationItemAccess } = await server.ssrLoadModule("/src/data/item-acquisition.ts");
    const { upgradeForRuneLevel } = await server.ssrLoadModule(
      "/src/features/detail/build-advisor/progression-model.ts",
    );

    for (const marker of bosses) {
      const result = recommendBossBuild(buildInput(marker, scenario));
      if (!result) {
        failures.push(`${marker.name}: no recommendation`);
        continue;
      }

      const characterClass = erClasses.find((entry) => entry.name === result.weapon.className);
      const stats = result.weapon.stats;
      const buildStats = {
        Vig: stats.vig,
        Mind: stats.mind,
        End: stats.end,
        Str: stats.str,
        Dex: stats.dex,
        Int: stats.int,
        Fai: stats.fai,
        Arc: stats.arc,
      };
      const actualLevel = characterClass ? levelForBuild(characterClass, buildStats) : Infinity;
      if (actualLevel > scenario.level) {
        failures.push(`${marker.name}: RL ${actualLevel} build exceeds RL ${scenario.level}`);
      }
      if (Object.values(stats).some((value) => value < 1 || value > 99)) {
        failures.push(`${marker.name}: contains an invalid attribute value`);
      }

      const needs = requirements(result.weapon.weaponId);
      const availableStrength = scenario.twoHanded ? Math.floor(stats.str * 1.5) : stats.str;
      const available = { str: availableStrength, dex: stats.dex, int: stats.int, fai: stats.fai, arc: stats.arc };
      const unmet = Object.entries(needs).filter(([key, value]) => available[key] < value);
      if (unmet.length > 0) {
        failures.push(`${marker.name}: ${result.weapon.item.name} has unmet requirements`);
      }
      if (result.progression.weaponPerformanceRatio < MATCHUP_PERFORMANCE_FLOOR) {
        failures.push(`${marker.name}: selection fell below the matchup performance floor`);
      }
      const expectedUpgrade = upgradeForRuneLevel(scenario.level, result.weapon.maxUpgrade);
      if (result.weapon.upgrade !== expectedUpgrade) {
        failures.push(
          `${marker.name}: expected +${expectedUpgrade}, found +${result.weapon.upgrade}`,
        );
      }

      const items = [
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
      const inaccessible = items.filter((item) => !recommendationItemAccess(item, marker.id).available);
      if (inaccessible.length > 0) {
        failures.push(`${marker.name}: recommends inaccessible ${inaccessible.map((item) => item.name).join(", ")}`);
      }
      if (result.ashOfWar && (
        result.ashOfWar.item.icon_id <= 0
        || /\b(?:dummy|placeholder)\b/i.test(result.ashOfWar.item.name)
      )) {
        failures.push(`${marker.name}: recommends placeholder Ash of War ${result.ashOfWar.item.name}`);
      }

      recommendations.push({
        markerId: marker.id,
        weapon: result.weapon.item.name,
        upgrade: result.weapon.upgrade,
        performanceRatio: result.progression.weaponPerformanceRatio,
      });
    }
  } finally {
    await server.close();
  }

  return { scenario, failures, recommendations };
};

if (process.argv[2] === "--worker") {
  const scenario = JSON.parse(process.argv[3]);
  process.stdout.write(JSON.stringify(await runWorker(scenario)));
} else {
  const results = [];
  for (const scenario of scenarios) {
    const { stdout } = await execFileAsync(
      process.execPath,
      [fileURLToPath(import.meta.url), "--worker", JSON.stringify(scenario)],
      { cwd: root, maxBuffer: 16 * 1024 * 1024 },
    );
    results.push(JSON.parse(stdout));
  }

  const failures = results.flatMap((result) => (
    result.failures.map((failure) => `${result.scenario.key}: ${failure}`)
  ));
  const rows = results.map(({ scenario, recommendations }) => {
    const counts = new Map();
    for (const entry of recommendations) counts.set(entry.weapon, (counts.get(entry.weapon) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
    const [topWeapon, topCount] = ranked[0] ?? ["None", 0];
    const topThreeCount = ranked.slice(0, 3).reduce((sum, entry) => sum + entry[1], 0);
    const total = recommendations.length;
    const topShare = topCount / Math.max(1, total);
    const topThreeShare = topThreeCount / Math.max(1, total);
    if (topShare > 0.4) {
      failures.push(`${scenario.key}: ${topWeapon} dominates ${(topShare * 100).toFixed(1)}% of encounters`);
    }
    if (topThreeShare > 0.85) {
      failures.push(`${scenario.key}: top three weapons dominate ${(topThreeShare * 100).toFixed(1)}% of encounters`);
    }
    return {
      scenario: scenario.key,
      recommendations: total,
      uniqueWeapons: counts.size,
      topWeapon,
      topShare: `${(topShare * 100).toFixed(1)}%`,
      topThreeShare: `${(topThreeShare * 100).toFixed(1)}%`,
      worstPerformance: `${(Math.min(...recommendations.map((entry) => entry.performanceRatio)) * 100).toFixed(1)}%`,
    };
  });

  console.table(rows);
  if (failures.length > 0) {
    console.error(`Build advisor matrix audit failed:\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
  } else {
    console.log(`Build advisor matrix audit passed ${results.length} scenarios across ${bosses.length} encounters.`);
  }
}
