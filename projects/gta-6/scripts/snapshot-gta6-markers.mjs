import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const playwright = process.env.GTA6_PLAYWRIGHT_MODULE
  ? pathToFileURL(path.resolve(process.env.GTA6_PLAYWRIGHT_MODULE)).href
  : "playwright";
const { chromium } = await import(playwright);
const target = path.resolve(import.meta.dirname, "../artifacts/gtabase-import/supplemental-markers.json");
const browser = await chromium.launch({
  headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}),
});
try {
  const page = await browser.newPage();
  const response = await page.goto("https://www.gtabase.com/gta-6/map/", {
    waitUntil: "domcontentloaded", timeout: 25_000,
  });
  if (!response?.ok()) throw new Error(`Map HTTP ${response?.status()}`);
  await page.waitForFunction(() => window.GTAB?.entries && window.GTAB_CATEGORIES, {}, { timeout: 15_000 });
  const snapshot = await page.evaluate(() => ({
    updated: window.GTAB_MARKERS_UPDATED,
    categories: window.GTAB_CATEGORIES,
    records: Object.values(window.GTAB.entries).map(({ data }) => ({
      id: data.id, name: data.name, category: data.category, x: data.x, y: data.y,
      image: data.image, imageSmall: data.image_small, description: data.description,
    })),
  }));
  if (!Number.isFinite(Date.parse(snapshot.updated)) || !snapshot.records.length ||
      new Set(snapshot.records.map(record => record.id)).size !== snapshot.records.length) {
    throw new Error("Incomplete or duplicate marker snapshot.");
  }
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(snapshot, null, 2) + "\n");
  await rename(temporary, target);
  console.log(JSON.stringify({ updated: snapshot.updated, markers: snapshot.records.length }));
} finally {
  await browser.close();
}
