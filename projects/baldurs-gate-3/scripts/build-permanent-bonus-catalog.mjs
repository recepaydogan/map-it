import fs from "node:fs";
import path from "node:path";

const parseArguments = (values) => {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    result.set(key.slice(2), value);
  }
  for (const required of ["source", "recipe", "stats-catalog", "dialog-catalog", "output", "source-build"]) {
    if (!result.has(required)) throw new Error(`Missing required argument: --${required}`);
  }
  return result;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findEvidence = (lines, specification, sourceFile) => {
  const needle = typeof specification === "string" ? specification : specification.needle;
  const occurrence = typeof specification === "object" ? specification.occurrence : undefined;
  if (typeof needle !== "string" || !needle) throw new Error(`${sourceFile}: evidence needs a non-empty needle.`);
  const matches = lines.flatMap((line, index) => line.includes(needle)
    ? [{ provenance: sourceFile, sourceLine: index + 1, statement: line.trim() }]
    : []);
  if (Number.isInteger(occurrence) && occurrence > 0) {
    if (!matches[occurrence - 1]) {
      throw new Error(`${sourceFile}: evidence occurrence ${occurrence} is out of range for ${JSON.stringify(needle)}.`);
    }
    return { ...matches[occurrence - 1], occurrence };
  }
  if (matches.length !== 1) {
    throw new Error(`${sourceFile}: expected one occurrence of ${JSON.stringify(needle)}, found ${matches.length}.`);
  }
  return matches[0];
};

const collectRegistrations = (lines, functionName, sourceFile) => {
  const pattern = new RegExp(`^${escapeRegExp(functionName)}\\(\\(FLAG\\)(.+)_([0-9a-f-]{36}),\\s*"([^"]+)"\\);$`, "i");
  return lines.flatMap((line, index) => {
    const match = line.trim().match(pattern);
    return match ? [{
      stateId: match[1],
      flagId: match[2].toLocaleLowerCase("en-US"),
      valueId: match[3],
      provenance: sourceFile,
      sourceLine: index + 1,
      statement: line.trim(),
    }] : [];
  });
};

const abilityFromState = (stateId, pattern) => {
  const match = stateId.match(pattern);
  if (!match) throw new Error(`Could not derive an ability from ${stateId}.`);
  return match[1].toLocaleLowerCase("en-US");
};

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const sourceRoot = path.resolve(arguments_.get("source"));
  const recipe = JSON.parse(fs.readFileSync(path.resolve(arguments_.get("recipe")), "utf8"));
  const statsCatalog = JSON.parse(fs.readFileSync(path.resolve(arguments_.get("stats-catalog")), "utf8"));
  const dialogCatalog = JSON.parse(fs.readFileSync(path.resolve(arguments_.get("dialog-catalog")), "utf8"));
  const sourceBuild = arguments_.get("source-build");

  if (recipe.schemaVersion !== 1 || !Array.isArray(recipe.interactions) || recipe.interactions.length === 0) {
    throw new Error("Permanent-bonus recipe needs schemaVersion 1 and at least one interaction.");
  }

  const interactions = recipe.interactions.map((entry) => {
    const sourcePath = path.join(sourceRoot, entry.sourceFile);
    const lines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/);
    const boonRows = collectRegistrations(lines, entry.boonRegistration, entry.sourceFile);
    const sacrificeRows = collectRegistrations(lines, entry.sacrificeRegistration, entry.sourceFile);
    if (boonRows.length !== entry.expectedBoonCount) {
      throw new Error(`${entry.id}: expected ${entry.expectedBoonCount} boon registrations, found ${boonRows.length}.`);
    }
    if (sacrificeRows.length !== entry.expectedSacrificeCount) {
      throw new Error(`${entry.id}: expected ${entry.expectedSacrificeCount} sacrifice registrations, found ${sacrificeRows.length}.`);
    }

    const boons = boonRows.map((row) => {
      const stat = statsCatalog.entries?.[row.valueId];
      if (!stat) throw new Error(`${entry.id}: passive ${row.valueId} is missing from the gameplay-stat catalog.`);
      const abilityBoosts = (stat.boosts ?? []).flatMap((boost) => {
        const match = boost.match(/^Ability\(([^,]+),\s*(-?\d+),\s*(\d+)\)$/i);
        return match ? [{ ability: match[1].toLocaleLowerCase("en-US"), amount: Number(match[2]), maximum: Number(match[3]), raw: boost }] : [];
      });
      if (abilityBoosts.length !== 1) throw new Error(`${entry.id}: ${row.valueId} needs one exact Ability boost.`);
      return {
        ...abilityBoosts[0],
        passiveId: row.valueId,
        stateId: row.stateId,
        flagId: row.flagId,
        provenance: row.provenance,
        sourceLine: row.sourceLine,
        statsProvenance: stat.provenance,
      };
    });

    const sacrifices = sacrificeRows.map((row) => ({
      ability: abilityFromState(row.stateId, /Offered([A-Za-z]+)Memory$/),
      statusId: row.valueId,
      stateId: row.stateId,
      flagId: row.flagId,
      provenance: row.provenance,
      sourceLine: row.sourceLine,
    }));

    const dialog = dialogCatalog.dialogs?.[entry.dialogCatalogId];
    if (!dialog || !(dialog.participants ?? []).some((id) => id.toLocaleLowerCase("en-US") === entry.dialogParticipantId.toLocaleLowerCase("en-US"))) {
      throw new Error(`${entry.id}: exact dialog ${entry.dialogCatalogId} does not contain participant ${entry.dialogParticipantId}.`);
    }
    const checks = (dialog.checks ?? []).map((check) => ({
      id: check.id,
      skill: check.skill,
      ability: check.ability,
      difficultyClass: check.difficultyClass,
      localizedText: check.localizedText,
    }));
    if (checks.length === 0 || checks.some((check) => !Number.isFinite(check.difficultyClass))) {
      throw new Error(`${entry.id}: exact dialog checks are missing numeric difficulty classes.`);
    }

    const evidence = [
      ...boonRows.map(({ provenance, sourceLine, statement }) => ({ provenance, sourceLine, statement })),
      ...sacrificeRows.map(({ provenance, sourceLine, statement }) => ({ provenance, sourceLine, statement })),
      ...entry.evidence.map((needle) => findEvidence(lines, needle, entry.sourceFile)),
      ...entry.forbiddenKnowledge.evidence.map((needle) => findEvidence(lines, needle, entry.sourceFile)),
    ];
    const prayerEvidence = evidence.find(({ statement }) => statement.includes(`IntegerSum(_Bonus, ${entry.prayerMemoryRollBonus}, _NewBonus)`));
    if (!prayerEvidence) throw new Error(`${entry.id}: prayer memory-roll bonus evidence is missing.`);

    return {
      id: entry.id,
      targetObjectId: entry.targetObjectId.toLocaleLowerCase("en-US"),
      title: entry.title,
      dialogParticipantId: entry.dialogParticipantId.toLocaleLowerCase("en-US"),
      dialogId: entry.dialogCatalogId,
      dialogTitle: dialog.title,
      prayerMemoryRollBonus: entry.prayerMemoryRollBonus,
      boons,
      sacrifices,
      checks,
      forbiddenKnowledge: {
        tagId: entry.forbiddenKnowledge.tagId,
        passiveId: entry.forbiddenKnowledge.passiveId,
        spellId: entry.forbiddenKnowledge.spellId,
      },
      evidence,
    };
  });

  const byTarget = Object.fromEntries(interactions.map((interaction) => [interaction.targetObjectId, [interaction]]));
  const catalog = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceBuild,
    stats: {
      interactions: interactions.length,
      boons: interactions.reduce((total, interaction) => total + interaction.boons.length, 0),
      sacrifices: interactions.reduce((total, interaction) => total + interaction.sacrifices.length, 0),
      checks: interactions.reduce((total, interaction) => total + interaction.checks.length, 0),
      evidenceStatements: interactions.reduce((total, interaction) => total + interaction.evidence.length, 0),
    },
    interactions,
    byTarget,
  };
  const outputPath = path.resolve(arguments_.get("output"));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Permanent bonuses: ${catalog.stats.interactions} interactions / ${catalog.stats.boons} boons / ${catalog.stats.checks} checks / ${catalog.stats.evidenceStatements} exact statements.`);
};

try {
  main();
} catch (error) {
  console.error("Permanent-bonus build failed:", error);
  process.exitCode = 1;
}
