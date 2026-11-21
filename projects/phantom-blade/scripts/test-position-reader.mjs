import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const result = await build({ entryPoints: [fileURLToPath(new URL("src/features/live-position/phantom-blade-position-reader.ts", root))],
  bundle: true, platform: "node", format: "esm", write: false, define: { "import.meta.env": '{"DEV":false}' } });
const { decodePhantomBladePosition } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const manifest = JSON.parse(await readFile(new URL("public/manifest.json", root), "utf8"));
const hash = /reader-([a-f0-9]+)\.dll$/.exec(manifest.data["extra-objects"]["phantom-blade-position-reader"].file)[1];
const executable = new URL(`artifacts/live-tracker-research-2026-10-29/position-reader-${hash}.exe`, root);
const profiles = new URL("native/position-reader/profiles-v1.json", root);
const catalog = JSON.parse(await readFile(profiles, "utf8"));
if (!process.argv.includes("--profiles-only")) {
  const { stdout } = await promisify(execFile)(fileURLToPath(executable), ["0", "8"], { windowsHide: true, timeout: 12000 });
  const local = stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
  const discovered = local.filter(sample => sample.state === "live");
  const distinct = new Set(discovered.map(sample => sample.sequence)).size;
  assert(distinct >= 5, `Expected live samples without any profile, last state: ${local.at(-1)?.state}`);
  assert(discovered.every(sample => decodePhantomBladePosition(JSON.stringify(sample), sample.sampledAt)));
  console.log(`Passed: ${distinct} live samples from local discovery with no profile loaded.`);
}
const probe = spawn(fileURLToPath(executable), ["0", "25", "-", "--profiles-only"], { windowsHide: true });
const exited = once(probe, "close");
const output = createInterface({ input: probe.stdout });
const samples = output[Symbol.asyncIterator]();
let lastState;
const waitFor = async (expected, count = 1) => {
  const matches = [];
  while (matches.length < count) {
    const sample = await samples.next();
    assert(!sample.done, `Expected ${expected} from a running PBZ world, last state: ${lastState}`);
    const value = JSON.parse(sample.value);
    lastState = value.state;
    if (lastState === expected) matches.push(value);
  }
  return matches;
};
const send = (value) => probe.stdin.write(`${JSON.stringify(value)}\n`);
let live;
try {
  await waitFor("unsupported-build");
  send(catalog);
  const [first] = await waitFor("live");
  send({ schemaVersion: 1, profiles: [{ sha256: "invalid" }] });
  await waitFor("live", 10);
  send({ schemaVersion: 1, profiles: [] });
  await waitFor("unsupported-build");
  send(catalog);
  live = await waitFor("live", 10);
  assert(live.every(sample => sample.pid === first.pid && sample.sequence > first.sequence));
} finally {
  probe.stdin.end();
  probe.kill();
  await exited;
}
const current = live.at(-1), now = current.sampledAt;
const decoded = decodePhantomBladePosition(JSON.stringify(current), now);
assert(decoded);
const metadata = JSON.parse(await readFile(new URL(`public/maps/${decoded.position.mapId}/metadata.json`, root), "utf8"));
assert(Math.abs(decoded.position.x - current.u * metadata.bounds.maxX) < 1e-8);
assert(Math.abs(decoded.position.y - current.v * metadata.bounds.maxY) < 1e-8);
assert(Math.abs(Math.hypot(decoded.position.dx, decoded.position.dy) - 1) < 1e-8);
const invalid = [
  { ...current, state: "unavailable" }, { ...current, region: "unknown" },
  { ...current, layer: 4 }, { ...current, u: 1.01 }, { ...current, v: -0.01 },
  { ...current, sampledAt: now - 1501 }, { ...current, sampledAt: now + 1001 },
  { ...current, sequence: 0 }, { ...current, sequence: 1.5 }, { ...current, dx: 2 },
];
for (const packet of invalid) assert.equal(decodePhantomBladePosition(JSON.stringify(packet), now), null);
assert.equal(decodePhantomBladePosition('{"state":"live"}', now), null);
assert.equal(decodePhantomBladePosition("invalid", now), null);
const report = { date: new Date().toISOString(), nativeSamples: live.length, rejectedInvalidPackets: invalid.length + 2, first: live[0], last: current, decoded: decoded.position };
await writeFile(new URL("artifacts/live-tracker-research-2026-10-29/reader-integration-check.json", root), JSON.stringify(report, null, 2));
console.log("Passed: live profile activation, invalid update rejection, revocation and recovery in the same PBZ process.");
console.log("Passed: native mesh projection and app packet validation.");
