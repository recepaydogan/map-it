/** Extract the targeting-frame skull used for a shared Rare/Rare Elite marker. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import BLPFile from "js-blp";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
// Interface\\TARGETINGFRAME\\UI-TargetingFrame-Skull.blp in the installed client.
const fileDataId = 137025;
const file = `FILE${fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const blp = new BLPFile(storage.readFile(file));
  if (blp.width !== 32 || blp.height !== 32) throw new Error("Targeting-frame skull dimensions changed.");
  const outputDirectory = join(root, "public/maps/client-icons");
  await mkdir(outputDirectory, { recursive: true });
  await sharp(blp.getPixels(0).readBuffer(), {
    raw: { width: blp.width, height: blp.height, channels: 4 },
  }).png().toFile(join(outputDirectory, "rare-creature.png"));
  console.log(`rare-creature.png: client file ${fileDataId}`);
} finally {
  storage.close();
}
