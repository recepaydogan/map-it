import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const manifestPath = path.join(rootDir, "public/data/er-map/elden-ring/manifest.json");

function main() {
  console.log("Starting cleanup of dummy enemies from Elden Ring er-map files...");

  if (!fs.existsSync(manifestPath)) {
    console.error("manifest.json not found!");
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  let newTotalRecords = 0;
  const globalCounts = {};

  for (const view of manifest.views) {
    console.log(`Processing view: ${view.key}...`);
    const newTypeCounts = {};
    let newViewRecordCount = 0;

    if (view.url) {
      // Single file view
      const filePath = path.join(rootDir, "public", view.url);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const filtered = data.filter((m) => m.type !== "part/dummy-enemy");
        fs.writeFileSync(filePath, JSON.stringify(filtered), "utf-8");

        for (const m of filtered) {
          const cat = m.category || m.type;
          newTypeCounts[cat] = (newTypeCounts[cat] || 0) + 1;
          globalCounts[cat] = (globalCounts[cat] || 0) + 1;
        }
        newViewRecordCount = filtered.length;
      } else {
        console.warn(`View file not found: ${filePath}`);
      }
    } else if (view.chunks) {
      // Tiled chunk view
      for (const [category, chunkUrl] of Object.entries(view.chunks)) {
        const filePath = path.join(rootDir, "public", chunkUrl);
        if (fs.existsSync(filePath)) {
          const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          const filtered = data.filter((m) => m.type !== "part/dummy-enemy");
          fs.writeFileSync(filePath, JSON.stringify(filtered), "utf-8");

          newTypeCounts[category] = filtered.length;
          globalCounts[category] = (globalCounts[category] || 0) + filtered.length;
          newViewRecordCount += filtered.length;
        } else {
          console.warn(`Chunk file not found: ${filePath}`);
        }
      }
    }

    view.typeCounts = newTypeCounts;
    view.recordCount = newViewRecordCount;
    newTotalRecords += newViewRecordCount;
  }

  manifest.totalRecords = newTotalRecords;
  manifest.globalTypeCounts = globalCounts;

  fs.writeFileSync(manifestPath, JSON.stringify(manifest), "utf-8");
  console.log("Successfully cleaned up dummy enemies and updated manifest.json!");
}

main();
