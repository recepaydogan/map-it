import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const apps = JSON.parse(await fs.readFile(path.join(root, "src/features/app-library/map-apps.json"), "utf8"));
const variants = JSON.parse(await fs.readFile(path.join(root, "public/game-library-variants.json"), "utf8"));
const { hub: { showcaseDescriptions } } = JSON.parse(await fs.readFile(path.join(root, "src/i18n/locales/en.json"), "utf8"));
const sources = JSON.parse(await fs.readFile(path.join(root, "docs/library-artwork-sources.json"), "utf8"));
for (const [moduleId, games] of Object.entries(variants)) {
  const app = apps.find(entry => entry.id === moduleId);
  assert(app, `${moduleId}: missing shared module`);
  assert.equal(games[0]?.id, moduleId, `${moduleId}: preserve the default game entry`);
  assert.deepEqual(games.flatMap(game => game.gameIds).sort(), [...app.gameIds].sort(), `${moduleId}: game variants must cover the module's launch IDs`);
}
const games = apps.flatMap(app => variants[app.id] ?? [app]);
assert.equal(new Set(games.map(game => game.id)).size, games.length, "Library game IDs must be unique");
let totalBytes = 0;
for (const app of games) {
  assert(showcaseDescriptions[app.id]?.trim(), `${app.id}: missing English showcase description`);
  const icon = await sharp(path.join(root, "public/game-cards/icons", `${app.id}.png`)).metadata();
  assert(sources.sidebarIcons.sources[app.id], `${app.id}: game icon needs a recorded source`);
  assert(icon.format === "png" && icon.width === icon.height && icon.width >= 48, `${app.id}: missing or undersized game icon`);
  const source = sources.assets.find(asset => asset.id === app.id);
  assert(source?.url || source?.localSource, `${app.id}: artwork needs a recorded source`);
  assert(source.cardSource && source.cardSource !== source.url, `${app.id}: poster needs its own source`);
  const poster = await sharp(path.join(root, "public/game-cards/catalog", `${app.id}.webp`)).metadata();
  assert(poster.format === "webp" && poster.width === 480 && poster.height === 720, `${app.id}: poster must be 480 × 720 WebP`);
  const file = path.join(root, "public/game-cards/worlds", `${app.id}.webp`);
  const { width, height } = await sharp(file).metadata();
  assert(width >= 1920 && height >= 620 && width > height, `${app.id}: use full-resolution landscape artwork`);
  assert.equal(width, source.width, `${app.id}: artwork width differs from the recorded output`);
  assert.equal(height, source.height, `${app.id}: artwork height differs from the recorded output`);
  totalBytes += (await fs.stat(file)).size;
  console.log(`${app.id}: ${width} × ${height}`);
}
console.log(`${games.length} game icons, portrait posters, and full-resolution showcase images verified (${(totalBytes / 1024 / 1024).toFixed(2)} MiB of showcase artwork).`);
