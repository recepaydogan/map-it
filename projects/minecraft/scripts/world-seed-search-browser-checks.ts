import type { NewWorld } from "../src/features/worlds/world-types";

const settle = async () => {
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise(resolve => setTimeout(resolve, 40));
};
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const setInput = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Missing native input setter");
  setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true }));
};

export const runWorldSeedSearchBrowserChecks = async (surface: HTMLElement, readSaved: () => NewWorld | null) => {
  const checks: string[] = [];
  const name = surface.querySelector<HTMLInputElement>('[aria-label="World name"]');
  const seed = surface.querySelector<HTMLInputElement>('[aria-label="Seed"]');
  const save = surface.querySelector<HTMLButtonElement>('button[type="submit"]');
  assert(name && seed && save, "World form controls are incomplete");
  setInput(name, "Seed search diagnostic"); setInput(seed, "42"); await settle();
  assert(!save.disabled, "A valid manual signed seed should be saveable");
  checks.push("Manual seed remains a distinct valid creation path");

  const curatedUnavailable = surface.querySelector<HTMLButtonElement>('[role="tab"][data-seed-mode="curated"]');
  assert(curatedUnavailable, "Missing curated-world mode"); curatedUnavailable.click(); await settle();
  assert(save.disabled && surface.textContent?.includes("No curated worlds are verified"),
    "Curated mode reused a seed outside its exact supported context");
  checks.push("Curated mode fails closed outside its exact edition/version context");

  const findTab = surface.querySelector<HTMLButtonElement>('[role="tab"][data-seed-mode="search"]');
  assert(findTab, "Missing Find a seed mode"); findTab.click(); await settle();
  assert(save.disabled, "Search mode reused a manual seed before a verified match");
  assert(surface.textContent?.includes("Seed search is unavailable"), "Unsupported default release was not explained");
  checks.push("Search mode cannot reuse a manual seed and explains unsupported versions");

  const version = surface.querySelector<HTMLButtonElement>('[aria-label="Generation version"]');
  assert(version, "Missing generation version dropdown"); version.click(); await settle();
  const supported = [...surface.querySelectorAll<HTMLButtonElement>('button[role="option"]')].find(option => option.textContent?.trim() === "1.21.3");
  assert(supported, "Supported Java search release is absent"); supported.click(); await settle();
  const search = [...surface.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Find matching seed"));
  assert(search && !search.disabled, "Supported context did not enable seed search"); search.click();
  for (let attempt = 0; attempt < 400 && !surface.textContent?.includes("Match found"); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  assert(surface.textContent?.includes("Match found"), `Packaged engine did not return the deterministic match: ${
    surface.querySelector<HTMLElement>("[data-seed-search-error]")?.dataset.seedSearchError ?? "no technical detail"}`);
  assert(surface.textContent?.includes("within 942 blocks"), "Matched candidate distance was not rendered");
  assert(!save.disabled, "Verified search result did not enable world creation");
  checks.push("Packaged Java worker finds and presents a biome-viable structure candidate");

  const preference = surface.querySelector<HTMLButtonElement>('[aria-label="World preference"]');
  assert(preference, "Missing world-preference dropdown"); preference.click(); await settle();
  const combined = [...surface.querySelectorAll<HTMLButtonElement>('button[role="option"]')]
    .find(option => option.textContent?.includes("Village, snowy mountains and cherry grove"));
  assert(combined, "Combined biome/structure preference is absent for Java 1.21.3"); combined.click(); await settle();
  const combinedSearch = [...surface.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Find matching seed"));
  assert(combinedSearch && !combinedSearch.disabled, "Combined Java search did not enable"); combinedSearch.click();
  for (let attempt = 0; attempt < 400 && !surface.textContent?.includes("Cherry grove biome"); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  assert(surface.textContent?.includes("Snowy mountain biomes") && surface.textContent?.includes("Cherry grove biome")
    && surface.textContent?.includes("detected in 3 directions"), "Combined Java result did not explain biome evidence");
  const combinedSeed = surface.querySelector<HTMLElement>("p.font-mono")?.textContent?.trim();
  assert(combinedSeed === "35" && !save.disabled, "Combined Java result did not retain its exact verified seed");
  checks.push("Combined Java preference requires a village, cherry grove and multi-direction snowy biome evidence");

  const panel = surface.querySelector<HTMLElement>(".seed-search-panel")!.getBoundingClientRect();
  const rail = surface.querySelector<HTMLElement>(".seed-search-rail")!.getBoundingClientRect();
  assert(Math.round(panel.width) === 304, "World form no longer matches the 304px ER base-panel width");
  assert(panel.right <= rail.left, "World form or result crossed the reserved 440px advertising rail");
  checks.push("World preference, progress and result stay in the 304px panel outside the ad rail");

  save.click(); await settle();
  const savedJava = readSaved();
  assert(savedJava?.edition === "java" && savedJava.generation.version === "1.21.3" && savedJava.generation.seed === "35" && savedJava.generation.preset === "default",
    "Saved world did not preserve the exact searched generator identity");
  checks.push("Saving retains exact edition, version, preset and signed seed identity");

  const edition = surface.querySelector<HTMLButtonElement>('[aria-label="Edition"]');
  assert(edition, "Missing edition dropdown"); edition.click(); await settle();
  const bedrock = [...surface.querySelectorAll<HTMLButtonElement>('button[role="option"]')].find(option => option.textContent?.trim() === "Bedrock Edition");
  assert(bedrock, "Bedrock target is absent"); bedrock.click(); await settle();
  assert(save.disabled && surface.textContent?.includes("Seed search is unavailable"), "Edition change retained a stale Java match");
  const bedrockVersion = surface.querySelector<HTMLButtonElement>('[aria-label="Generation version"]');
  assert(bedrockVersion, "Missing Bedrock version dropdown"); bedrockVersion.click(); await settle();
  const supportedBedrock = [...surface.querySelectorAll<HTMLButtonElement>('button[role="option"]')].find(option => option.textContent?.trim() === "1.21.60");
  assert(supportedBedrock, "Supported Bedrock search release is absent"); supportedBedrock.click(); await settle();
  const bedrockPreference = surface.querySelector<HTMLButtonElement>('[aria-label="World preference"]');
  assert(bedrockPreference, "Missing Bedrock world-preference dropdown"); bedrockPreference.click(); await settle();
  const combinedBedrock = [...surface.querySelectorAll<HTMLButtonElement>('button[role="option"]')]
    .find(option => option.textContent?.includes("Village, snowy mountains and cherry grove"));
  assert(combinedBedrock, "Combined biome/structure preference is absent for Bedrock 1.21.60"); combinedBedrock.click(); await settle();
  const bedrockSearch = [...surface.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Find matching seed"));
  assert(bedrockSearch && !bedrockSearch.disabled, "Supported Bedrock context did not enable seed search"); bedrockSearch.click();
  for (let attempt = 0; attempt < 400 && !surface.textContent?.includes("Cherry grove biome"); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  assert(surface.textContent?.includes("Snowy mountain biomes") && surface.textContent?.includes("Cherry grove biome"), `Packaged Bedrock engine did not return its combined deterministic match: ${
    surface.querySelector<HTMLElement>("[data-seed-search-error]")?.dataset.seedSearchError ?? "no technical detail"}`);
  assert(!save.disabled, "Verified Bedrock result did not enable world creation"); save.click(); await settle();
  const savedBedrock = readSaved();
  assert(savedBedrock?.edition === "bedrock" && savedBedrock.generation.version === "1.21.60" && savedBedrock.generation.seed === "35",
    "Bedrock result did not replace the Java generator identity");
  checks.push("Edition switch invalidates stale results and packaged Bedrock combined search saves its own exact context");

  const curatedTab = surface.querySelector<HTMLButtonElement>('[role="tab"][data-seed-mode="curated"]');
  assert(curatedTab, "Missing curated-world mode"); curatedTab.click(); await settle();
  assert(!save.disabled && surface.textContent?.includes("Snowbound cherry village") && surface.textContent?.includes("Seed 35"),
    "Exact-context curated mode did not select its verified default");
  const curatedSelect = surface.querySelector<HTMLButtonElement>('[aria-label="Curated world"]');
  assert(curatedSelect, "Missing curated-world dropdown"); curatedSelect.click(); await settle();
  const ocean = [...surface.querySelectorAll<HTMLButtonElement>('button[role="option"]')]
    .find(option => option.textContent?.includes("Ocean expedition"));
  assert(ocean, "Bedrock ocean curated pick is absent"); ocean.click(); await settle();
  assert(surface.textContent?.includes("Seed 123456789") && surface.textContent?.includes("Shipwreck and ocean ruins") && !save.disabled,
    "Curated pick did not expose its exact seed and verification profile");
  const preview = surface.querySelector<HTMLImageElement>('img[alt*="Ocean expedition"]');
  for (let attempt = 0; attempt < 100 && (!preview?.complete || !preview.naturalWidth); attempt++) await new Promise(resolve => setTimeout(resolve, 25));
  assert(preview?.naturalWidth === 640 && preview.naturalHeight === 360,
    "Curated pick did not load its exact high-density preview");
  assert(surface.textContent?.includes("Shipwreck") && surface.textContent?.includes("Ocean ruin"),
    "Curated pick did not expose its useful feature tags");
  assert(preview.getBoundingClientRect().right <= surface.querySelector<HTMLElement>(".seed-search-rail")!.getBoundingClientRect().left,
    "Curated preview crossed the reserved advertising rail");
  save.click(); await settle();
  const savedCurated = readSaved();
  assert(savedCurated?.edition === "bedrock" && savedCurated.generation.version === "1.21.60"
    && savedCurated.generation.seed === "123456789" && savedCurated.generation.preset === "default",
  "Curated save did not retain its exact Bedrock generator context");
  checks.push("Curated picks load a crisp exact-context preview, useful tags and save their verified seed identity");

  return { status: "PASS", checks, saved: { java: savedJava, bedrock: savedBedrock, curated: savedCurated },
    scope: "Production form, Worker and packaged Java/Bedrock WASM; deterministic candidates; no database or game-save access" };
};
