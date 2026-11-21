/** Keep Wowhead quest prose captures and app locale packs moving in small resumable batches. */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const batchSize = 40;
const output = join(root, "data/site-research/wowhead-quest-prose-captures.jsonl");
const retrySourceUnmatched = process.argv.includes("--retry-source-unmatched=true");
const targetRetry = /^--retry-target=([A-Za-z]+):(description|progressText|completionText|all)$/
  .exec(process.argv.find((arg) => arg.startsWith("--retry-target=")) ?? "");
if (retrySourceUnmatched && targetRetry) throw new Error("Choose one retry mode");
const batchCountArg = process.argv.slice(2).find((arg) => /^\d+$/.test(arg));
const maxBatches = batchCountArg ? Number(batchCountArg) : Infinity;
if (maxBatches !== Infinity && (!Number.isSafeInteger(maxBatches) || maxBatches < 1)) {
  throw new Error("Pass a positive maximum batch count");
}
const run = (script, args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [join(root, "scripts", script), ...args],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; process.stdout.write(chunk); });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve(stdout) :
    reject(new Error(`${script} exited ${code}`)));
});
const recordCount = async () => (await readFile(output, "utf8"))
  .split(/\r?\n/).filter(Boolean).length;
const publishReviewedCaptures = async () => {
  const suffix = `${process.pid}-${randomUUID()}`;
  const scope = join(tmpdir(), `wowhead-quest-prose-scope-${suffix}.json`);
  const receipt = join(tmpdir(), `wowhead-quest-prose-receipt-${suffix}.json`);
  try {
    const review = await run("review-wowhead-quest-locale-release.mjs", [scope]);
    const result = JSON.parse(review.trim().split(/\r?\n/).at(-1));
    if (!Number.isSafeInteger(result.files) || result.files < 0) {
      throw new Error("Invalid reviewed locale file count");
    }
    if (!result.files) return;
    await run("publish-reviewed-locales.mjs", ["--prepare", scope, receipt]);
    await run("publish-reviewed-locales.mjs", ["--upload", receipt]);
  } finally {
    await Promise.all([scope, receipt].map((file) => unlink(file).catch((error) => {
      if (error.code !== "ENOENT") console.error(`Could not remove ${file}: ${error.message}`);
    })));
  }
};
if (process.argv.includes("--publish-reviewed-only")) {
  await publishReviewedCaptures();
  process.exit(0);
}
for (let batch = 1; batch <= maxBatches; batch++) {
  const captureScript = targetRetry ? "retry-wowhead-quest-prose-target.mjs" :
    "capture-wowhead-quest-prose-batch.mjs";
  const modeArgs = targetRetry ?
    [`--language=${targetRetry[1]}`, `--field=${targetRetry[2]}`] :
    (retrySourceUnmatched ? ["--retry-source-unmatched=true"] : []);
  const status = await run(captureScript, ["--status-only=true", "--limit=1", ...modeArgs]);
  const pending = Number(/^(\d+) (?:unique quest prose sets|\w+ \w+ locale fields) pending/m
    .exec(status)?.[1]);
  if (!Number.isSafeInteger(pending)) throw new Error("Could not read quest prose queue");
  if (pending === 0) {
    console.log("Wowhead quest prose capture queue is empty.");
    break;
  }
  const before = await recordCount();
  console.log(`Batch ${batch}: ${pending} prose sets pending.`);
  await run(captureScript, [`--limit=${batchSize}`, ...(!targetRetry ? ["--concurrency=5"] : []),
    ...modeArgs]);
  await run("build-wowhead-quest-prose-locales.mjs", []);
  const objectiveReuse = await run("apply-wowhead-quest-objective-reuse.mjs", []);
  const reusedObjectives = [...objectiveReuse.matchAll(/:\s+(\d+) exact-English Wowhead objectives reused/g)]
    .reduce((total, match) => total + Number(match[1]), 0);
  if (reusedObjectives) await run("build-wowhead-quest-prose-locales.mjs", []);
  try {
    await publishReviewedCaptures();
  } catch (error) {
    console.error(`Reviewed quest locale publication failed: ${error.message}`);
  }
  const after = await recordCount();
  if (after === before) throw new Error("No Wowhead pages captured in this batch");
  console.log(`Batch ${batch}: ${after - before} new locale pages, ${after} total.`);
}
