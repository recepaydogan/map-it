/** Preserve the game's own minimap tracking taxonomy from its UI script. */
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const fileDataId = 4637141;
const storage = Storage.openEx(installDir, { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const bytes = storage.readFile(`FILE${fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const text = bytes.toString("utf8");
  if (!text.includes('Name = "MinimapTrackingFilter"')) {
    throw new Error("The client minimap filter source changed.");
  }
  const values = [...text.matchAll(/\{ Name = "([A-Za-z0-9_]+)", Type = "MinimapTrackingFilter", EnumValue = (\d+) \}/g)]
    .map(([, name, value]) => ({ name, value: Number(value) }));
  if (values.length !== 26 || new Set(values.map(({ value }) => value)).size !== values.length) {
    throw new Error("Unexpected minimap tracking enumeration in the local client.");
  }
  const output = join(root, "data/client-research/minimap-tracking-filters.json");
  await writeFile(output, `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    fileDataId, sha256: createHash("sha256").update(bytes).digest("hex"),
  }, values }, null, 2)}\n`);
  console.log(`Extracted ${values.length} client minimap tracking filters.`);
} finally {
  storage.close();
}
