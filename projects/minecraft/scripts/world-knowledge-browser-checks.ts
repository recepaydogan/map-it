import type { RecipeInspectorCatalog } from "../src/features/knowledge/recipe-inspector-content";

const settle = async () => {
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise(resolve => setTimeout(resolve, 40));
};
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

/** Exercises the production world-guide layer with an exact local catalog artifact. */
export const runWorldKnowledgeBrowserChecks = async (surface: HTMLElement, artifact: RecipeInspectorCatalog & object, mechanics: object) => {
  const checks: string[] = [];
  const input = surface.querySelector<HTMLInputElement>('input[type="file"]');
  assert(input, "Missing local catalog input");
  const transfer = new DataTransfer();
  transfer.items.add(new File([JSON.stringify(artifact)], "exact-version-catalog.json", { type: "application/json" }));
  transfer.items.add(new File([JSON.stringify(mechanics)], "exact-version-mechanics.json", { type: "application/json" }));
  Object.defineProperty(input, "files", { configurable: true, value: transfer.files });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  for (let attempt = 0; attempt < 100 && !surface.querySelector("[data-knowledge-ready]"); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert(surface.querySelector("[data-knowledge-ready]"), "Catalogs did not enter the ready state");
  checks.push("Exact local recipe and mechanics catalogs reach the production guide ready state");

  const mechanicsOnly = new DataTransfer();
  mechanicsOnly.items.add(new File([JSON.stringify(mechanics)], "replacement-mechanics.json", { type: "application/json" }));
  Object.defineProperty(input, "files", { configurable: true, value: mechanicsOnly.files });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  for (let attempt = 0; attempt < 100 && surface.textContent?.includes("Validating catalog"); attempt++)
    await new Promise(resolve => setTimeout(resolve, 30));
  assert(surface.querySelector("[data-knowledge-ready]")?.textContent?.includes(`${artifact.recipes.length} recipes`),
    "Replacing only mechanics discarded the valid recipe family");
  checks.push("Incremental mechanics replacement retains the validated recipe family");

  const invalid = structuredClone(mechanics) as { source?: { edition?: string } };
  if (invalid.source) invalid.source.edition = "wrong-edition";
  const rejected = new DataTransfer();
  rejected.items.add(new File([JSON.stringify(invalid)], "wrong-edition-mechanics.json", { type: "application/json" }));
  Object.defineProperty(input, "files", { configurable: true, value: rejected.files });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  for (let attempt = 0; attempt < 100 && !surface.querySelector('[role="alert"]'); attempt++)
    await new Promise(resolve => setTimeout(resolve, 30));
  assert(surface.querySelector('[role="alert"]') && surface.querySelector("[data-knowledge-ready]"),
    "Rejected replacement did not preserve and explain the prior valid catalog");
  checks.push("Rejected context mismatch preserves prior valid data and surfaces an error");

  const primary = Object.entries(artifact.index.usesItem).sort((left, right) => right[1].length - left[1].length)[0]?.[0];
  assert(primary, "Catalog requires a reverse-use item");
  const search = surface.querySelector<HTMLInputElement>('input[type="search"]');
  assert(search, "Missing guide search");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  assert(setter, "Missing native input setter");
  setter.call(search, primary);
  search.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  const item = surface.querySelector<HTMLButtonElement>(`[data-inspector-kind="item"][data-inspector-id="${CSS.escape(primary)}"]`);
  assert(item, "Search did not expose the exact item");
  item.click(); await settle();

  const rail = surface.querySelector<HTMLElement>(".knowledge-rail")!.getBoundingClientRect();
  const base = surface.querySelector<HTMLElement>("[data-world-knowledge] > aside");
  const panel = surface.querySelector<HTMLElement>("[data-inspector-entry]");
  assert(base && panel, "Wide map must retain the guide and open one detail panel");
  assert(Math.round(base.getBoundingClientRect().width) === 304, "Guide width must match the 304px reference panel");
  assert(Math.round(panel.getBoundingClientRect().width) === 360, "Detail width must match the 360px reference panel");
  assert(panel.getBoundingClientRect().left - base.getBoundingClientRect().right === 12, "Guide/detail gap must be 12px");
  assert(panel.getBoundingClientRect().right <= rail.left, "Detail panel crossed the reserved 440px rail");
  checks.push("304px guide + 12px gap + 360px detail remain outside the ad rail");

  const recipe = panel.querySelector<HTMLButtonElement>('[data-inspector-kind="recipe"]');
  assert(recipe, "Item needs a recipe relationship");
  recipe.click(); await settle();
  const recipePanel = surface.querySelector<HTMLElement>("[data-inspector-entry]");
  assert(recipePanel?.querySelector('[data-inspector-focus="back"]'), "Recipe must expose Back navigation");
  recipePanel.querySelector<HTMLButtonElement>('[data-inspector-focus="back"]')!.click(); await settle();
  assert(surface.querySelector<HTMLElement>("[data-inspector-entry]")?.querySelector(`[data-inspector-id="${CSS.escape(recipe.dataset.inspectorId!)}"]`),
    "Back did not restore the item relationship list");
  surface.querySelector<HTMLElement>("[data-inspector-entry]")!.querySelector<HTMLButtonElement>('[data-inspector-focus="back"]')!.click(); await settle();
  assert(!surface.querySelector("[data-inspector-entry]") && surface.querySelector(`[data-inspector-id="${CSS.escape(primary)}"]`),
    "Back to guide did not restore the base panel");
  checks.push("Item → recipe → Back → guide preserves the ER-style hierarchy");

  setter.call(search, "Mount"); search.dispatchEvent(new Event("input", { bubbles: true })); await settle();
  const entity = surface.querySelector<HTMLButtonElement>('[data-inspector-kind="entity"][data-inspector-id="fixture:mount"]');
  assert(entity, "Mechanics subject search did not expose the entity"); entity.click(); await settle();
  const behavior = surface.querySelector<HTMLElement>("[data-inspector-entry]");
  const mechanic = behavior?.querySelector<HTMLButtonElement>('[data-inspector-kind="mechanic"][data-inspector-id="fixture:equip_mount"]');
  assert(mechanic, "Entity did not expose its equipment mechanic"); mechanic.click(); await settle();
  const mechanicPanel = [...surface.querySelectorAll<HTMLElement>("[data-inspector-entry]")].at(-1);
  const requirement = mechanicPanel?.querySelector<HTMLButtonElement>('[data-inspector-kind="item"][data-inspector-id="fixture:tack"]');
  assert(requirement, "Equipment mechanic did not expose its required item"); requirement.click(); await settle();
  const requiredPanel = [...surface.querySelectorAll<HTMLElement>("[data-inspector-entry]")].at(-1);
  const back = requiredPanel?.querySelector<HTMLButtonElement>('[data-inspector-focus="back"]');
  assert(back, "Required item did not retain mechanic Back history"); back.click(); await settle();
  assert([...surface.querySelectorAll<HTMLElement>("[data-inspector-entry]")].at(-1)?.querySelector('[data-inspector-id="fixture:tack"]'),
    "Back did not restore the mechanic requirement row");
  checks.push("Entity → equipment mechanic → required item → Back uses the same ER detail history");

  const closeGuide = surface.querySelector<HTMLButtonElement>("[data-close-guide]");
  assert(closeGuide, "Missing guide close action"); closeGuide.click(); await settle();
  const marker = surface.querySelector<HTMLButtonElement>('[data-structure-point="fixture:village-point"]');
  assert(marker, "Structure marker did not return after closing the guide"); marker.click(); await settle();
  const poiPanel = surface.querySelector<HTMLElement>("[data-inspector-entry]");
  const guideLink = poiPanel?.querySelector<HTMLButtonElement>('[data-inspector-kind="poi"][data-inspector-id="minecraft:village"]');
  assert(guideLink, "Mapped structure did not expose its exact catalog POI"); guideLink.click(); await settle();
  const guidePoi = surface.querySelector<HTMLElement>("[data-inspector-entry]");
  const poiMechanic = guidePoi?.querySelector<HTMLButtonElement>('[data-inspector-kind="mechanic"][data-inspector-id="fixture:village_help"]');
  assert(poiMechanic, "POI guide did not expose its interaction mechanic"); poiMechanic.click(); await settle();
  const interaction = surface.querySelector<HTMLElement>("[data-inspector-entry]");
  const relatedItem = interaction?.querySelector<HTMLButtonElement>('[data-inspector-kind="item"][data-inspector-id="fixture:tack"]');
  assert(relatedItem, "POI interaction did not expose its related item"); relatedItem.click(); await settle();
  const itemPanel = surface.querySelector<HTMLElement>("[data-inspector-entry]");
  assert(itemPanel?.querySelector('[data-inspector-focus="back"]'), "POI knowledge path lost Back navigation");
  itemPanel.querySelector<HTMLButtonElement>('[data-inspector-focus="back"]')!.click(); await settle();
  surface.querySelector<HTMLElement>("[data-inspector-entry]")!.querySelector<HTMLButtonElement>('[data-inspector-focus="back"]')!.click(); await settle();
  surface.querySelector<HTMLElement>("[data-inspector-entry]")!.querySelector<HTMLButtonElement>('[data-inspector-focus="back"]')!.click(); await settle();
  assert(surface.querySelector<HTMLElement>("[data-inspector-entry]")?.textContent?.includes("Village"),
    "Back did not restore the original generated village candidate");
  const structurePanel = surface.querySelector<HTMLElement>("[data-inspector-entry]")!.getBoundingClientRect();
  assert(structurePanel.right <= rail.left, "POI knowledge navigation crossed the reserved advertising rail");
  checks.push("Map POI → guide POI → interaction → item → Back restores the generated marker detail outside the ad rail");
  return { status: "PASS", primary, checks, scope: "Production guide UI with cached development fixture; no save or game-file access" };
};
