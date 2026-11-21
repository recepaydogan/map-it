import fs from "node:fs";
import path from "node:path";

const parseArguments = (values) => {
  const originSources = [];
  let catalogPath;
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    if (key === "--origin-source") originSources.push(value);
    else if (key === "--catalog") catalogPath = value;
    else throw new Error(`Unknown argument ${key}.`);
  }
  if (!catalogPath) throw new Error("--catalog is required.");
  if (originSources.length === 0) throw new Error("At least one --origin-source is required.");
  return { catalogPath: path.resolve(catalogPath), originSources: originSources.map((source) => path.resolve(source)) };
};

const attributeValue = (body, id) => body
  .match(new RegExp(`<attribute\\s+id="${id}"[^>]*\\svalue="([^"]+)"`))?.[1];

const readOrigins = (sources) => {
  const origins = new Map();
  for (const source of sources) {
    const xml = fs.readFileSync(source, "utf8");
    for (const body of xml.split(/<node\s+id="Origin">/).slice(1)) {
      const id = attributeValue(body, "UUID")?.toLocaleLowerCase("en-US");
      const templateId = attributeValue(body, "GlobalTemplate")?.toLocaleLowerCase("en-US");
      const defaultsTemplateId = attributeValue(body, "DefaultsTemplate")?.toLocaleLowerCase("en-US");
      const available = Number(attributeValue(body, "AvailableInCharacterCreation"));
      if (!id) continue;
      origins.set(id, {
        templateId,
        defaultsTemplateId,
        availableInCharacterCreation: Number.isFinite(available) ? available : undefined,
        filterEligible: Boolean(templateId || defaultsTemplateId),
      });
    }
  }
  if (origins.size < 13) throw new Error(`Expected at least 13 Origin profiles; received ${origins.size}.`);
  return origins;
};

const { catalogPath, originSources } = parseArguments(process.argv.slice(2));
const origins = readOrigins(originSources);
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const usedOriginIds = new Set();
let updatedEffects = 0;

for (const dialog of Object.values(catalog.dialogs ?? {})) {
  for (const approval of dialog.approvals ?? []) {
    for (const effect of approval.effects ?? []) {
      const originId = effect.originId?.toLocaleLowerCase("en-US");
      const origin = origins.get(originId);
      if (!origin) throw new Error(`Approval effect ${approval.id} references unknown Origin ${effect.originId}.`);
      usedOriginIds.add(originId);
      effect.originTemplateId = origin.templateId;
      effect.originDefaultsTemplateId = origin.defaultsTemplateId;
      effect.originAvailableInCharacterCreation = origin.availableInCharacterCreation;
      effect.originFilterEligible = origin.filterEligible;
      for (const key of ["originTemplateId", "originDefaultsTemplateId", "originAvailableInCharacterCreation"]) {
        if (effect[key] === undefined) delete effect[key];
      }
      updatedEffects += 1;
    }
  }
}

catalog.stats = {
  ...catalog.stats,
  filterableApprovalOrigins: [...usedOriginIds].filter((originId) => origins.get(originId)?.filterEligible).length,
};
fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Approval Origin facets enriched on ${updatedEffects} effects across ${usedOriginIds.size} reaction profiles.`);
