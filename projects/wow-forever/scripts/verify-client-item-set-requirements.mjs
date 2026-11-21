/** Corroborate the packed ItemSetSpell piece threshold against complete sets. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = JSON.parse(await readFile(join(root, "data/client-research/item-set-links.json"), "utf8"));
const rows = source.records.flatMap((set) => set.bonuses.map((bonus) => ({ set, bonus,
  high: bonus.rawRequirementField >>> 16,
  low: bonus.rawRequirementField & 0xffff })));
if (!rows.length || rows.some((row) => row.high !== 20 || !Number.isInteger(row.low))) {
  throw new Error("ItemSetSpell packed requirement no longer has the observed layout");
}
const complete = source.records.filter((set) => set.memberItemIds.length > 0
  && set.members.length === set.memberItemIds.length && set.members.every(({ name }) => Boolean(name)));
const verified = complete.flatMap((set) => set.bonuses.map((bonus) => ({ set, bonus,
  requiredPieces: bonus.rawRequirementField & 0xffff })));
if (verified.some(({ set, bonus, requiredPieces }) => !bonus.spellName
  || requiredPieces < 2 || requiredPieces > set.memberItemIds.length)) {
  throw new Error("A complete set has a bonus threshold outside its member range");
}
const report = {
  source: source.source,
  completeSetCount: complete.length,
  completeBonusCount: verified.length,
  packedHighHalf: 20,
  thresholdCounts: Object.fromEntries([...new Set(verified.map(({ requiredPieces }) => requiredPieces))]
    .sort((a, b) => a - b).map((count) => [count,
      verified.filter(({ requiredPieces }) => requiredPieces === count).length])),
  unpublishedBonusCount: rows.length - verified.length,
  rule: "The low 16 bits of every complete, named ItemSetSpell bonus row are 2–8 and never exceed its set member count; the high 16 bits are always 20. This strongly corroborates a required-piece count. Only complete sets with named spells are published; incomplete set rows stay research-only.",
  records: complete.map((set) => ({ itemSetId: set.itemSetId, name: set.name,
    memberItemIds: set.memberItemIds,
    bonuses: set.bonuses.map((bonus) => ({ bonusId: bonus.bonusId,
      requiredPieces: bonus.rawRequirementField & 0xffff,
      spellId: bonus.spellId, spellName: bonus.spellName })) })),
};
await writeFile(join(root, "data/client-research/item-set-bonus-requirements.json"),
  `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.completeSetCount} complete sets, ${report.completeBonusCount} corroborated piece thresholds; ${report.unpublishedBonusCount} other bonus rows withheld`);
