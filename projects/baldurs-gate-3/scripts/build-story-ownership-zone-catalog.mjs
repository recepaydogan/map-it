import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const storyRoot = path.join(projectRoot, "map-sources", "extracted", "story-goals");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "story-ownership-zones.json");
const guidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});
const stripComment = (value) => {
  const commentIndex = value.indexOf("//");
  return (commentIndex >= 0 ? value.slice(0, commentIndex) : value).trim();
};
const splitArguments = (statement) => {
  const body = statement.slice(statement.indexOf("(") + 1, statement.lastIndexOf(")"));
  const output = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === '"' && body[index - 1] !== "\\") quoted = !quoted;
    if (!quoted && character === "(") depth += 1;
    if (!quoted && character === ")") depth -= 1;
    if (!quoted && depth === 0 && character === ",") {
      if (current.trim()) output.push(current.trim());
      current = "";
    } else current += character;
  }
  if (current.trim()) output.push(current.trim());
  return output;
};
const parseStatement = (lines, startIndex) => {
  let endIndex = startIndex;
  let statement = stripComment(lines[startIndex]).replace(/^NOT\s+/, "").trim();
  let balance = [...statement].reduce((value, character) => value + (character === "(" ? 1 : character === ")" ? -1 : 0), 0);
  while (balance > 0 && endIndex + 1 < lines.length) {
    endIndex += 1;
    const next = stripComment(lines[endIndex]);
    statement += ` ${next}`;
    balance += [...next].reduce((value, character) => value + (character === "(" ? 1 : character === ")" ? -1 : 0), 0);
  }
  const predicate = statement.match(/^([A-Za-z0-9_]+)\s*\(/)?.[1];
  if (!predicate || statement.lastIndexOf(")") < 0) return null;
  statement = statement.slice(0, statement.lastIndexOf(")") + 1).replace(/\s+/g, " ");
  return { predicate, arguments: splitArguments(statement), statement, endIndex };
};
const endpoint = (argument) => {
  const token = argument.replace(/^\([A-Z]+\)/, "").trim();
  const id = token.match(new RegExp(`(?:^|_)(${guidPattern.source})$`, "i"))?.[1]?.toLocaleLowerCase("en-US");
  return id ? { id, token } : null;
};

const zones = new Map();
let exactRegistrations = 0;
let fallbackRegistrations = 0;
let shopRegistrations = 0;
for (const filePath of walkFiles(storyRoot)
  .filter((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".txt"))
  .filter((candidate) => !/SavegamePatches/i.test(candidate))) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  let section = "";
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (["INITSECTION", "KBSECTION", "EXITSECTION"].includes(trimmed)) {
      section = trimmed;
      continue;
    }
    if (!/^\s*(?:NOT\s+)?DB_Item(?:OwnerShipTriggers(?:Fallback)?|ShopTrigger)\s*\(/i.test(stripComment(lines[index]))) continue;
    const parsed = parseStatement(lines, index);
    if (!parsed) continue;
    const fallback = parsed.predicate === "DB_ItemOwnerShipTriggersFallback";
    const shop = parsed.predicate === "DB_ItemShopTrigger";
    const level = shop || fallback ? null : parsed.arguments[0]?.match(/^"([^"]+)"$/)?.[1];
    const trigger = endpoint(parsed.arguments[shop || fallback ? 0 : 1] ?? "");
    const owner = endpoint(parsed.arguments[shop || fallback ? 1 : 2] ?? "");
    if (!trigger || !owner || (!shop && !fallback && !level)) continue;
    const evidence = {
      sourcePath: path.relative(projectRoot, filePath).split(path.sep).join("/"),
      sourceLine: index + 1,
      statement: parsed.statement,
    };
    const current = zones.get(trigger.id) ?? {
      triggerId: trigger.id,
      token: trigger.token,
      levels: [],
      owners: [],
      shopOwners: [],
      evidence: [],
    };
    if (level) current.levels.push(level);
    const ownerEntry = { ...owner, conditional: section !== "INITSECTION", fallback, evidence: [evidence] };
    (shop ? current.shopOwners : current.owners).push(ownerEntry);
    current.evidence.push(evidence);
    zones.set(trigger.id, current);
    if (shop) shopRegistrations += 1;
    else if (fallback) fallbackRegistrations += 1;
    else exactRegistrations += 1;
    index = parsed.endIndex;
  }
}

const mergeOwners = (owners) => [...new Map(owners.map((owner) => [owner.id, owner])).values()]
  .map((owner) => ({
    ...owner,
    conditional: owners.filter(({ id }) => id === owner.id).every(({ conditional }) => conditional),
    fallback: owners.filter(({ id }) => id === owner.id).every(({ fallback }) => fallback),
    evidence: owners.filter(({ id }) => id === owner.id).flatMap(({ evidence }) => evidence),
  }))
  .sort((left, right) => Number(left.fallback) - Number(right.fallback) || left.token.localeCompare(right.token, "en"));
const entries = [...zones.values()].map((zone) => ({
  ...zone,
  levels: [...new Set(zone.levels)].sort((left, right) => left.localeCompare(right, "en")),
  owners: mergeOwners(zone.owners),
  shopOwners: mergeOwners(zone.shopOwners),
  evidence: [...new Map(zone.evidence.map((evidence) => [`${evidence.sourcePath}:${evidence.sourceLine}`, evidence])).values()],
})).filter(({ owners }) => owners.length > 0)
  .sort((left, right) => left.triggerId.localeCompare(right.triggerId, "en"));

const catalog = {
  schemaVersion: 1,
  sourceBuild: "24532579",
  stats: {
    exactRegistrations,
    fallbackRegistrations,
    shopRegistrations,
    ownershipZones: entries.length,
    zonesWithMultipleOwners: entries.filter(({ owners }) => owners.length > 1).length,
    shopZones: entries.filter(({ shopOwners }) => shopOwners.length > 0).length,
  },
  entries,
  byTriggerId: Object.fromEntries(entries.map((entry) => [entry.triggerId, entry])),
};

fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Story ownership zones: ${entries.length} exact regions with ${exactRegistrations + fallbackRegistrations} owner registrations.`);
