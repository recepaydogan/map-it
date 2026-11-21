import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "vite";
import { root, createReleaseContentPlan } from "./release-content.mjs";
import { uploadReleaseContent, releaseContentBaseUrl } from "./upload-release-content.mjs";

try {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--dry-run", "--upload"].includes(arg)) || (args.includes("--dry-run") && args.includes("--upload"))) throw new Error("Use --dry-run or --upload.");
  const env = loadEnv("production", root, "");
  const plan = await createReleaseContentPlan();
  const baseUrl = releaseContentBaseUrl(env.R2_PUBLIC_ORIGIN, plan.fingerprint);
  console.log(JSON.stringify({ mode: args.includes("--upload") ? "upload" : "dry-run", fingerprint: plan.fingerprint,
    files: plan.files.length, bytes: plan.totalBytes, baseUrl,
    uiTranslations: plan.files.filter(file => file.path.startsWith("locales/")).length,
    englishBundled: true }));
  if (args.includes("--upload")) {
    const receipt = await uploadReleaseContent(plan, env);
    const fresh = await createReleaseContentPlan();
    if (fresh.fingerprint !== plan.fingerprint) throw new Error("Content changed during publication; the app release was not switched.");
    // Switch only after immutable assets and their last-written manifest verify.
    await writeFile(path.join(root, "content-release.json"), JSON.stringify({ version: 1,
      fingerprint: receipt.fingerprint, baseUrl: receipt.baseUrl, manifestSha256: receipt.manifestSha256,
      fileCount: receipt.fileCount, contentBytes: receipt.contentBytes, publishedAt: receipt.publishedAt }, null, 2) + "\n");
    console.log(`App content release selected: ${receipt.baseUrl}`);
  }
} catch (error) {
  console.error(`Content publication stopped: ${error.message}`);
  process.exitCode = 1;
}
