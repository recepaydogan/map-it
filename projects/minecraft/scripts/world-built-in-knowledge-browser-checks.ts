const settle = async () => {
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise(resolve => setTimeout(resolve, 40));
};
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const runWorldBuiltInKnowledgeBrowserChecks = async (surface: HTMLElement) => {
  const checks: string[] = [];
  await settle();
  const ready = surface.querySelector<HTMLElement>("[data-knowledge-ready]");
  assert(ready?.textContent?.includes("17 subjects") && ready.textContent.includes("4 recipes") && ready.textContent.includes("10 mechanics"),
    "Built-in catalog did not enter the production ready state");
  checks.push("Exact Java 1.20.6 built-in catalog opens with 17 subjects, four recipes and ten mechanics");

  const search = surface.querySelector<HTMLInputElement>('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  assert(search && setter, "Missing production guide search");
  setter.call(search, "minecraft:horse"); search.dispatchEvent(new Event("input", { bubbles: true })); await settle();
  const horse = surface.querySelector<HTMLButtonElement>('[data-inspector-kind="entity"][data-inspector-id="minecraft:horse"]');
  assert(horse?.querySelector('[data-map-sprite="0:0"][data-map-sprite-source="/poi-artwork/knowledge-horse-v1.png"]'),
    "Horse search result did not render its configured atlas cell");
  horse.click(); await settle();
  const rail = surface.querySelector<HTMLElement>(".knowledge-rail")!.getBoundingClientRect();
  const base = surface.querySelector<HTMLElement>("[data-world-knowledge] > aside");
  let panel = surface.querySelector<HTMLElement>("[data-inspector-entry]");
  assert(base && panel, "Horse detail did not retain the guide companion panel");
  assert(Math.round(base.getBoundingClientRect().width) === 304 && Math.round(panel.getBoundingClientRect().width) === 360,
    "Guide and detail widths diverged from the ER reference");
  assert(panel.getBoundingClientRect().right <= rail.left, "Horse detail crossed the reserved advertising rail");
  assert(panel.querySelector('[data-map-sprite="0:0"]'), "Horse detail header lost its artwork");
  checks.push("Horse artwork reaches both the 304px guide and 360px ER detail panel outside the ad rail");

  const tame = panel.querySelector<HTMLButtonElement>('[data-inspector-kind="mechanic"][data-inspector-id="minecraft:horse/tame"]');
  assert(tame, "Horse detail did not expose taming"); tame.click(); await settle();
  panel = [...surface.querySelectorAll<HTMLElement>("[data-inspector-entry]")].at(-1) ?? null;
  assert(panel?.querySelector('[data-map-sprite="3:2"]'), "Taming detail lost the horse-care artwork cell");
  const sugar = panel?.querySelector<HTMLButtonElement>('[data-inspector-kind="item"][data-inspector-id="minecraft:sugar"]');
  assert(sugar?.textContent?.includes("feeding can speed taming"), "Taming did not expose the sourced food relationship");
  sugar.click(); await settle();
  panel = [...surface.querySelectorAll<HTMLElement>("[data-inspector-entry]")].at(-1) ?? null;
  assert(panel?.querySelector('[data-map-sprite="1:1"]'), "Sugar detail lost its atlas cell");
  assert(panel?.querySelector('[data-inspector-kind="mechanic"][data-inspector-id="minecraft:horse/feed_sugar"]'),
    "Sugar did not expose its horse-care use");
  panel.querySelector<HTMLButtonElement>('[data-inspector-focus="back"]')!.click(); await settle();
  assert([...surface.querySelectorAll<HTMLElement>("[data-inspector-entry]")].at(-1)?.querySelector('[data-inspector-id="minecraft:sugar"]'),
    "Back did not restore the taming relationship row");
  checks.push("Horse → taming → sugar → Back preserves the shared ER detail history and illustrated identity");

  setter.call(search, "minecraft:golden_apple"); search.dispatchEvent(new Event("input", { bubbles: true })); await settle();
  const goldenApple = surface.querySelector<HTMLButtonElement>('[data-inspector-kind="item"][data-inspector-id="minecraft:golden_apple"]');
  assert(goldenApple, "Golden apple search did not expose the built-in recipe subject"); goldenApple.click(); await settle();
  panel = [...surface.querySelectorAll<HTMLElement>("[data-inspector-entry]")].at(-1) ?? null;
  const recipe = panel?.querySelector<HTMLButtonElement>('[data-inspector-kind="recipe"][data-inspector-id="minecraft:golden_apple"]');
  assert(recipe, "Golden apple did not expose its crafting recipe"); recipe.click(); await settle();
  panel = [...surface.querySelectorAll<HTMLElement>("[data-inspector-entry]")].at(-1) ?? null;
  assert(panel?.querySelectorAll('[role="img"]').length === 9, "Golden apple did not render its exact 3×3 crafting pattern");
  const ingot = panel?.querySelector<HTMLButtonElement>('[data-inspector-kind="item"][data-inspector-id="minecraft:gold_ingot"]');
  assert(ingot?.querySelector('[data-map-sprite="0:0"][data-map-sprite-source="/poi-artwork/knowledge-recipes-v1.png"]'),
    "Golden apple recipe did not expose the illustrated gold ingot");
  ingot.click(); await settle();
  panel = [...surface.querySelectorAll<HTMLElement>("[data-inspector-entry]")].at(-1) ?? null;
  assert(panel?.textContent?.includes("Eight gold ingots"), "Gold ingot detail did not retain localized source context");
  panel.querySelector<HTMLButtonElement>('[data-inspector-focus="back"]')!.click(); await settle();
  assert([...surface.querySelectorAll<HTMLElement>("[data-inspector-entry]")].at(-1)?.querySelector('[data-inspector-id="minecraft:gold_ingot"]'),
    "Back did not restore the golden apple ingredient list");
  checks.push("Golden apple → exact 3×3 recipe → illustrated gold ingot → Back joins crafting and mechanics navigation");

  surface.querySelector<HTMLButtonElement>("[data-close-guide]")!.click(); await settle();
  const marker = surface.querySelector<HTMLButtonElement>('[data-structure-point="built-in:village"]');
  assert(marker, "Village marker did not return after closing the guide"); marker.click(); await settle();
  panel = surface.querySelector<HTMLElement>("[data-inspector-entry]");
  const village = panel?.querySelector<HTMLButtonElement>('[data-inspector-kind="poi"][data-inspector-id="minecraft:village"]');
  assert(village?.querySelector('[data-map-sprite="2:2"]'), "Generated village did not link to the illustrated built-in POI");
  village.click(); await settle();
  panel = surface.querySelector<HTMLElement>("[data-inspector-entry]");
  const find = panel?.querySelector<HTMLButtonElement>('[data-inspector-kind="mechanic"][data-inspector-id="minecraft:horse/find"]');
  assert(find, "Village guide did not expose the horse habitat relationship"); find.click(); await settle();
  panel = surface.querySelector<HTMLElement>("[data-inspector-entry]");
  assert(panel?.querySelector('[data-inspector-kind="entity"][data-inspector-id="minecraft:horse"]'),
    "Horse habitat mechanic did not link back to the horse subject");
  assert(panel && panel.getBoundingClientRect().right <= rail.left, "POI knowledge path crossed the advertising rail");
  checks.push("Generated village → guide POI → habitat mechanic → horse uses the same bounded inspector graph");

  return { status: "PASS", checks, scope: "Synthetic UI state with bundled exact-version facts; no save or game-file access" };
};
