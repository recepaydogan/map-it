import fs from "node:fs";
import path from "node:path";

const parseArguments = (values) => {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    result.set(key.slice(2), value);
  }
  return result;
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const humanizeResourceName = (value) => value
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
  .trim();

const findEvidence = (lines, statement, provenance, occurrence) => {
  const matches = lines.flatMap((line, index) => line.includes(statement) ? [{ provenance, sourceLine: index + 1, statement }] : []);
  if (occurrence !== undefined) {
    if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > matches.length) throw new Error(`Invalid occurrence ${occurrence} for ${statement}.`);
    return { ...matches[occurrence - 1], occurrence };
  }
  if (matches.length !== 1) throw new Error(`Expected one exact occurrence of ${statement}; received ${matches.length}.`);
  return matches[0];
};

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const sourceRoot = path.resolve(arguments_.get("source"));
  const recipe = readJson(path.resolve(arguments_.get("recipe")));
  const placements = readJson(path.resolve(arguments_.get("placements")));
  const outputPath = path.resolve(arguments_.get("output"));
  const sourceBuild = arguments_.get("source-build") ?? null;
  if (recipe.schemaVersion !== 1 || !Array.isArray(recipe.plans)) throw new Error("Unsupported rescue-plan recipe schema.");
  const placementsById = new Map(placements.records.map((record) => [record.id.toLocaleLowerCase("en-US"), record]));

  const plans = [];
  const byTarget = {};
  for (const planRecipe of recipe.plans) {
    const storyPath = path.join(sourceRoot, planRecipe.storySource);
    const returnPath = path.join(sourceRoot, planRecipe.returnSource);
    const storyLines = fs.readFileSync(storyPath, "utf8").split(/\r?\n/);
    const returnLines = fs.readFileSync(returnPath, "utf8").split(/\r?\n/);
    const evidence = [];

    const turnPattern = new RegExp(`^${planRecipe.turnFunction}\\(\"([^\"]+)\",\\s*(\\d+)\\);`);
    const turnLimits = {};
    for (let index = 0; index < storyLines.length; index += 1) {
      const match = storyLines[index].match(turnPattern);
      if (!match) continue;
      turnLimits[match[1].toLocaleLowerCase("en-US")] = Number(match[2]);
      evidence.push({ provenance: planRecipe.storySource, sourceLine: index + 1, statement: storyLines[index].trim() });
    }
    if (!Number.isInteger(turnLimits.easy) || !Number.isInteger(turnLimits.medium) || !Number.isInteger(turnLimits.hard)) {
      throw new Error(`${planRecipe.id} is missing an exact EASY, MEDIUM or HARD turn limit.`);
    }

    const floodPattern = new RegExp(`^${planRecipe.floodFunction}\\((\\d+),`);
    const floodRegistrations = [];
    for (let index = 0; index < storyLines.length; index += 1) {
      const match = storyLines[index].match(floodPattern);
      if (!match) continue;
      floodRegistrations.push(Number(match[1]));
      evidence.push({ provenance: planRecipe.storySource, sourceLine: index + 1, statement: storyLines[index].trim() });
    }
    const floodTurns = [...new Set(floodRegistrations)];
    if (floodTurns.length !== 1) throw new Error(`${planRecipe.id} must have one exact authored flood turn.`);

    const buildHostage = (entry, conditional) => {
      const groupStatementNeedle = `${planRecipe.groupFunction}(${entry.group},`;
      const groupLine = storyLines.find((line) => line.includes(groupStatementNeedle) && line.toLocaleLowerCase("en-US").includes(entry.characterId));
      if (!groupLine) throw new Error(`${planRecipe.id} cannot resolve group ${entry.group} character ${entry.characterId}.`);
      const groupEvidence = findEvidence(storyLines, groupLine.trim(), planRecipe.storySource);
      evidence.push(groupEvidence);

      const placement = placementsById.get(entry.targetObjectId.toLocaleLowerCase("en-US"));
      if (!placement?.position || placement.level !== planRecipe.level) throw new Error(`${planRecipe.id} target ${entry.targetObjectId} has no exact ${planRecipe.level} placement.`);

      let title = entry.title;
      let titleEvidence;
      if (!title) {
        const returnLine = returnLines.find((line) => line.includes(planRecipe.returnDialogFunction) && line.toLocaleLowerCase("en-US").includes(entry.characterId));
        if (!returnLine) throw new Error(`${planRecipe.id} cannot resolve the return-dialog identity for ${entry.characterId}.`);
        const resourceMatch = returnLine.match(/IRN_IronThrone_([A-Za-z0-9]+)_[0-9a-f-]+/i);
        if (!resourceMatch) throw new Error(`${planRecipe.id} cannot parse a name from ${returnLine.trim()}.`);
        title = humanizeResourceName(resourceMatch[1]);
        titleEvidence = findEvidence(returnLines, returnLine.trim(), planRecipe.returnSource);
      } else if (entry.titleEvidence) {
        titleEvidence = findEvidence(returnLines, entry.titleEvidence, planRecipe.returnSource, entry.titleEvidenceOccurrence);
      }
      if (titleEvidence) evidence.push(titleEvidence);

      const hostage = {
        id: `${planRecipe.id}:${entry.characterId}`,
        characterId: entry.characterId,
        targetObjectId: entry.targetObjectId,
        title,
        group: entry.group,
        conditional,
        ...(entry.presenceFlagId ? { presenceFlagId: entry.presenceFlagId } : {}),
        internalName: placement.internalName,
        worldPosition: placement.position,
        evidence: [groupEvidence, ...(titleEvidence ? [titleEvidence] : [])],
      };
      byTarget[entry.targetObjectId.toLocaleLowerCase("en-US")] = { planId: planRecipe.id, role: "hostage", hostageId: hostage.id };
      return hostage;
    };

    const fixedHostages = planRecipe.fixedHostages.map((entry) => buildHostage(entry, false));
    const conditionalHostages = planRecipe.conditionalHostages.map((entry) => buildHostage(entry, true));
    const escapePlacement = placementsById.get(planRecipe.escapeTargetId.toLocaleLowerCase("en-US"));
    if (!escapePlacement?.position || escapePlacement.level !== planRecipe.level) throw new Error(`${planRecipe.id} escape target has no exact placement.`);
    byTarget[planRecipe.escapeTargetId.toLocaleLowerCase("en-US")] = { planId: planRecipe.id, role: "escape" };

    plans.push({
      id: planRecipe.id,
      title: planRecipe.title,
      level: planRecipe.level,
      turnLimits,
      floodTurn: floodTurns[0],
      floodPositionCount: floodRegistrations.length,
      fixedHostageCount: fixedHostages.length,
      conditionalHostageCount: conditionalHostages.length,
      totalPossibleHostages: fixedHostages.length + conditionalHostages.length,
      escapeTargetId: planRecipe.escapeTargetId,
      escapeWorldPosition: escapePlacement.position,
      hostages: [...fixedHostages, ...conditionalHostages],
      evidence,
    });
  }

  const stats = {
    plans: plans.length,
    hostages: plans.reduce((total, plan) => total + plan.hostages.length, 0),
    fixedHostages: plans.reduce((total, plan) => total + plan.fixedHostageCount, 0),
    conditionalHostages: plans.reduce((total, plan) => total + plan.conditionalHostageCount, 0),
    evidenceStatements: plans.reduce((total, plan) => total + plan.evidence.length, 0),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), sourceBuild, stats, plans, byTarget }, null, 2)}\n`);
  console.log(`Rescue plans: ${stats.plans} plan / ${stats.hostages} possible hostages / ${stats.evidenceStatements} exact statements.`);
};

try {
  main();
} catch (error) {
  console.error("Rescue-plan build failed:", error);
  process.exitCode = 1;
}
