/** Group locally installed CASC files before attempting broader source scans. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";

const root = fileURLToPath(new URL("../", import.meta.url));
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const storage = Storage.openEx(installDir, { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const groups = new Map();
  let total = 0;
  let local = 0;
  try {
    for (let entry = storage.findFirstFile("*"); entry; entry = storage.findNextFile()) {
      total += 1;
      let group = groups.get(entry.contentFlags);
      if (!group) {
        group = { contentFlags: entry.contentFlags, total: 0, local: 0,
          localBytes: 0, samples: [] };
        groups.set(entry.contentFlags, group);
      }
      group.total += 1;
      if (!entry.available) continue;
      local += 1;
      group.local += 1;
      group.localBytes += entry.fileSize;
      if (group.samples.length < 3 && entry.fileSize > 0 && entry.fileSize < 2_000_000) {
        group.samples.push({ fileDataId: entry.fileDataId, name: entry.fileName,
          size: entry.fileSize });
      }
    }
  } finally {
    storage.findClose();
  }
  for (const group of groups.values()) {
    for (const sample of group.samples) {
      try {
        const bytes = storage.readFile(sample.name);
        sample.magicHex = bytes.subarray(0, 4).toString("hex");
        sample.magicText = bytes.subarray(0, 4).toString("latin1")
          .replace(/[^\x20-\x7e]/g, ".");
      } catch (error) {
        if (error?.codeName !== "ERROR_FILE_ENCRYPTED") throw error;
        sample.readError = error.codeName;
      }
    }
  }
  const output = join(root, "data/client-research/archive-flags.json");
  await mkdir(join(root, "data/client-research"), { recursive: true });
  await writeFile(output, `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber, installDir,
  }, total, local, groups: [...groups.values()].sort((a, b) => b.local - a.local) }, null, 2)}\n`);
  console.log(`Indexed ${total} archive entries (${local} local) into ${groups.size} flag groups.`);
} finally {
  storage.close();
}
