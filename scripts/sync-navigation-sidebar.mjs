import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const apps = JSON.parse(await readFile(path.join(root, "config/map-apps.json"), "utf8"));
const files = [
  "navigation-sidebar.tsx",
  "navigation-sidebar.css",
  "navigation-host.ts",
  "game-page-artwork.css",
  "dashboard-window-chrome.tsx",
  "dashboard-window-chrome.css",
];
const layout = "src/components/layout";
const itemCatalogFiles = ["item-catalog.tsx", "item-catalog.css"];
const appsWithoutItemCatalog = new Set(["minecraft", "project-zomboid"]);

for (const { id, folder } of apps) {
  const destination = path.resolve(root, "..", folder, layout);
  await mkdir(destination, { recursive: true });
  const sharedFiles = appsWithoutItemCatalog.has(id) ? files : [...files, ...itemCatalogFiles];
  for (const name of sharedFiles) {
    await copyFile(path.join(root, layout, name), path.join(destination, name));
  }
}
