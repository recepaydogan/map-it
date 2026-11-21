import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

// Each process uses a different reader's actual device-zone default.
const formatInZone = (zone, iso, locale = "en-US") => execFileSync(process.execPath, [
  "--experimental-strip-types", "--input-type=module", "-e",
  `import { formatSupportTime } from ${JSON.stringify(new URL("./support-time.ts", import.meta.url).href)};
   process.stdout.write(formatSupportTime(process.argv[1], process.argv[2]));`,
  iso, locale,
], { env: { ...process.env, TZ: zone }, encoding: "utf8" }).trim();

test("shows each reader's local time and date for the same message", () => {
  const instant = "2026-10-28T00:15:00Z";
  assert.equal(formatInZone("Europe/Istanbul", instant), "Oct 28, 03:15 AM GMT+3");
  assert.equal(formatInZone("America/Los_Angeles", instant), "Oct 27, 05:15 PM GMT-7");
  assert.equal(formatInZone("Asia/Kolkata", instant), "Oct 28, 05:45 AM GMT+5:30");
});

test("preserves the stored instant regardless of the sender's offset", () => {
  assert.equal(
    formatInZone("Europe/Istanbul", "2026-10-27T17:15:00-07:00"),
    formatInZone("Europe/Istanbul", "2026-10-28T00:15:00Z"),
  );
});

test("uses the reader's daylight-saving offset at the message date", () => {
  assert.equal(formatInZone("America/New_York", "2026-07-28T12:15:00Z"), "Jul 28, 08:15 AM GMT-4");
  assert.equal(formatInZone("America/New_York", "2026-12-28T12:15:00Z"), "Dec 28, 07:15 AM GMT-5");
});

test("app language does not select the reader's time zone", () => {
  assert.equal(formatInZone("Europe/Istanbul", "2026-10-28T00:15:00Z", "de-DE"), "28. Okt., 03:15 GMT+3");
});
