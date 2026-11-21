/** Finish the source retry, verify one localized pilot, then retry the target heading. */
import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const exec = promisify(execFile);
const sourcePid = Number(process.argv[2]);
if (!Number.isSafeInteger(sourcePid) || sourcePid < 0) {
  throw new Error("Pass the source runner PID, or 0 when the source runner has exited");
}
const run = (script, args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [join(root, "scripts", script), ...args],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let stdout = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; process.stdout.write(chunk); });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve(stdout) :
    reject(new Error(`${script} exited ${code}`)));
});
const status = async () => {
  const output = await run("capture-wowhead-quest-prose-batch.mjs",
    ["--status-only=true", "--retry-source-unmatched=true", "--limit=1"]);
  const pending = Number(/^(\d+) unique quest prose sets pending/m.exec(output)?.[1]);
  if (!Number.isSafeInteger(pending)) throw new Error("Could not read source retry queue");
  return pending;
};
const sourceRunnerLive = async () => {
  if (!sourcePid) return false;
  try { process.kill(sourcePid, 0); } catch { return false; }
  // Windows can reuse a finished runner's PID for an unrelated process.
  const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive",
    "-Command", `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${sourcePid}').CommandLine`],
  { cwd: root, windowsHide: true });
  return /run-wowhead-quest-prose-import\.mjs/.test(stdout) &&
    /--retry-source-unmatched=true/.test(stdout);
};
while (await status()) {
  if (!await sourceRunnerLive()) {
    console.log("Source retry runner exited with pending work; resuming it.");
    await run("run-wowhead-quest-prose-import.mjs", ["--retry-source-unmatched=true"]);
  } else await new Promise((resolve) => setTimeout(resolve, 30_000));
}
// A batch can have written its last captures while its locale-pack build is
// still running. Wait for that runner to exit before writing the pilot record.
while (await sourceRunnerLive()) {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}
console.log("Source retry queue empty. Testing one zhCN completion field.");
const audit = () => run("audit-marker-panel-locales.mjs", []);
const gapCount = (output) => Number(/zhCN:.*quest prose \d+ covered, (\d+) missing/
  .exec(output)?.[1]);
const before = gapCount(await audit());
const pilotStatus = await run("retry-wowhead-quest-prose-target.mjs",
  ["--language=zhCN", "--field=completionText", "--ids=5", "--status-only=true"]);
const pilotPending = Number(/^(\d+) zhCN completionText locale fields pending/m
  .exec(pilotStatus)?.[1]);
if (pilotPending === 1) {
  const pilot = await run("retry-wowhead-quest-prose-target.mjs",
    ["--language=zhCN", "--field=completionText", "--ids=5", "--limit=1"]);
  if (!/Saved 1 locale pages, 1 translated fields, 0 failures/.test(pilot)) {
    throw new Error("zhCN pilot did not capture one translated field");
  }
  await run("build-wowhead-quest-prose-locales.mjs", []);
  const after = gapCount(await audit());
  if (!Number.isSafeInteger(before) || after !== before - 1) {
    throw new Error(`zhCN pilot audit did not improve by one field: ${before} -> ${after}`);
  }
  const pack = JSON.parse(await readFile(join(root,
    "public/data/locales/wow-forever/quest-prose-wowhead-zhCN.json"), "utf8"));
  if (!pack.quests[5]?.locales?.zhCN?.completionText) {
    throw new Error("zhCN pilot translation is absent from the locale pack");
  }
  console.log(`zhCN pilot verified: ${before} -> ${after} missing fields.`);
} else if (pilotPending !== 0) throw new Error("Could not read zhCN pilot status");
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const targetPending = async (locale) => {
  const output = await run("retry-wowhead-quest-prose-target.mjs",
    [`--language=${locale}`, "--field=all", "--status-only=true"]);
  const pending = Number(new RegExp(`^(\\d+) ${locale} all locale fields pending`, "m")
    .exec(output)?.[1]);
  if (!Number.isSafeInteger(pending)) {
    throw new Error(`Could not read ${locale} target queue`);
  }
  return pending;
};
while (true) {
  while (true) {
    const targets = [];
    for (const locale of locales) {
      const pending = await targetPending(locale);
      if (pending) targets.push({ locale, pending });
    }
    if (!targets.length) break;
    targets.sort((left, right) => left.pending - right.pending);
    const { locale, pending } = targets[0];
    console.log(`Retrying ${pending} ${locale} quest pages.`);
    await run("run-wowhead-quest-prose-import.mjs", [`--retry-target=${locale}:all`]);
    const remaining = await targetPending(locale);
    if (remaining >= pending) {
      throw new Error(`${locale} target retry made no progress: ${pending} -> ${remaining}`);
    }
  }
  const reopenedSource = await status();
  if (!reopenedSource) break;
  console.log(`${reopenedSource} source quest pages reopened during target retries.`);
  await run("run-wowhead-quest-prose-import.mjs", ["--retry-source-unmatched=true"]);
}
console.log("All target retry queues empty. Final marker panel audit:");
await audit();
console.log("Final all-locale completeness audit:");
await run("audit-locale-completeness.mjs", ["--limit", "1"]);
