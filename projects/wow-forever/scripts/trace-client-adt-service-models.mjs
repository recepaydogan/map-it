/** Find service and treasure artwork clues among models placed on world ADTs. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const profile = JSON.parse(await readFile(join(root, "data/client-research/adt-placement-profile.json"), "utf8"));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const terms = /mailbox|chest|coffer|treasure|bank|auction|innkeeper|stable|repair|vendor|merchant|trainer|barber|vault|boat|port|dock|flight|alchemy|alchemist|herbal|enchant|tailor|leather|blacksmith|smithy|forge|anvil|fishing|fisher|fishmonger|cooking|cook|kitchen|mining|miner|geology|skinning|skinner|engineering|engineer|first.?aid|apothecary/i;
try {
  if (storage.getProductInfo().buildNumber !== profile.source.build) {
    throw new Error("ADT profile and local game build differ.");
  }
  const candidates = [];
  const unavailable = [];
  const kinds = [
    { kind: "doodad", records: profile.doodadModels },
    { kind: "world-model", records: profile.worldModels },
  ];
  for (const { kind, records } of kinds) {
    for (const { fileDataId, placements } of records) {
      const info = storage.getFileInfo(fileName(fileDataId));
      if (!info || info.size === 0xffff_ffff) {
        unavailable.push({ kind, fileDataId, placements });
        continue;
      }
      const bytes = storage.readFile(fileName(fileDataId));
      const strings = [...new Set(bytes.toString("latin1")
        .match(/[A-Za-z][A-Za-z0-9_./\\-]{4,}/g) ?? [])];
      const matchingStrings = strings.filter((value) => terms.test(value));
      if (!matchingStrings.length) continue;
      candidates.push({ kind, fileDataId, placements,
        magic: bytes.subarray(0, 4).toString("latin1"),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        matchingStrings: matchingStrings.slice(0, 35) });
    }
  }
  candidates.sort((left, right) => right.placements - left.placements);
  const report = { source: profile.source,
    rule: "Embedded model strings are artwork clues. ADT decoration placements do not prove interactable game objects, NPCs, loot, or service availability.",
    inspectedModels: profile.doodadModels.length + profile.worldModels.length,
    unavailable, candidates };
  await writeFile(join(root, "data/client-research/adt-service-model-clues.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Inspected ${report.inspectedModels} placed models; ${unavailable.length} unavailable; ${candidates.length} contain service/treasure strings.`);
  console.log(candidates.slice(0, 35).map(({ kind, fileDataId, placements, matchingStrings }) =>
    `${kind} ${fileDataId} ×${placements}: ${matchingStrings.slice(0, 3).join(", ")}`).join("\n"));
} finally { storage.close(); }
