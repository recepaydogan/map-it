import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createReleaseContentPlan } from "./release-content.mjs";

export const validContentPath = (value) => /^(data|maps)\/[a-zA-Z0-9_./-]+$/.test(value)
  && !value.split("/").some((part) => part === "." || part === "..");
export const isTranslationPath = (value) => /(?:^|\/)(?:locales?|localization|translations?)(?:\/|$)/i.test(value);

// Legacy releases can contain locales. Preserve their published bytes without
// selecting, publishing local edits to, or removing those independent packs.
export async function createReviewedContentPlan(stage, baseline) {
  const plan = await createReleaseContentPlan(stage);
  for (const file of baseline.files.filter((entry) => isTranslationPath(entry.path))) {
    if (!validContentPath(file.path)) throw new Error("Unsafe baseline translation path");
    const sourcePath = path.join(stage, ...file.path.split("/"));
    const bytes = await readFile(sourcePath);
    if (bytes.length !== file.size || createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
      throw new Error(`Published locale changed: ${file.path}`);
    }
    if (!plan.files.some((entry) => entry.path === file.path)) plan.files.push({ ...file, sourcePath });
  }
  plan.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const fingerprint = createHash("sha256");
  for (const file of plan.files) fingerprint.update(`${file.path}\0${file.size}\0${file.sha256}\n`);
  return { files: plan.files, fingerprint: fingerprint.digest("hex").slice(0, 24) };
}
