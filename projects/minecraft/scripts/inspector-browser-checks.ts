import type { InspectorController } from "../src/features/inspector/inspector-controller";
import type { RecipeInspectorCatalog } from "../src/features/knowledge/recipe-inspector-content";

const settleFrames = async (signal?: AbortSignal) => {
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await new Promise(resolve => setTimeout(resolve, 30));
  signal?.throwIfAborted();
};
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

/** Runs against actual mounted production components and cached source records, without a map/save. */
export const runInspectorBrowserChecks = async (controller: InspectorController, catalog: RecipeInspectorCatalog, surface: HTMLElement, signal?: AbortSignal) => {
  const settle = () => settleFrames(signal);
  const checks: string[] = [], initialContext = controller.getSnapshot().context, originalWidth = surface.style.width;
  const source = catalog.recipes[0]?.source;
  assert(source && source.edition === initialContext.edition && source.version === initialContext.version && source.revision === initialContext.catalogRevision,
    "Diagnostic controller context does not match the loaded catalog");
  const primary = Object.entries(catalog.index.usesItem).sort((a, b) => b[1].length - a[1].length)[0]?.[0];
  assert(primary, "Catalog requires a reverse-use item");
  const panels = () => [...surface.querySelectorAll<HTMLElement>("[data-inspector-entry]")];
  const lastPanel = () => { const panel = panels().at(-1); assert(panel, "Missing mounted inspector"); return panel; };
  const current = () => { const entry = controller.getSnapshot().entries.at(-1); assert(entry, "Missing navigation entry"); return entry; };
  const body = () => { const node = lastPanel().querySelector<HTMLElement>("[data-inspector-body]"); assert(node, "Missing scroll body"); return node; };
  const back = async () => {
    const button = lastPanel().querySelector<HTMLButtonElement>('[data-inspector-focus="back"]');
    assert(button, "Missing Back control"); button.click(); await settle();
  };
  const withinRail = () => {
    const rail = surface.querySelector<HTMLElement>(".diagnostic-rail")!.getBoundingClientRect();
    for (const panel of panels()) {
      const bounds = panel.getBoundingClientRect();
      assert(bounds.right <= rail.left && bounds.left >= 0 && bounds.width > 0, "Inspector overlaps reserved rail or escapes map");
    }
  };
  try {
    // A real 840px usable map (1280px surface minus rail), independent of host browser dimensions.
    surface.style.width = "1280px";
    controller.close(); controller.open({ kind: "item", id: primary }); await settle();
    assert(panels().length === 1, "Narrow map must use one inspector");
    assert(lastPanel().getBoundingClientRect().width === 360, "Reference panel width must be 360px"); withinRail();
    const rootKey = current().key;
    let recipeButtons = [...lastPanel().querySelectorAll<HTMLButtonElement>('[data-inspector-kind="recipe"]')];
    assert(recipeButtons.length === Math.min(4, catalog.index.usesItem[primary].length), "Reverse-use preview must show at most four recipes");
    const more = lastPanel().querySelector<HTMLButtonElement>('[data-inspector-focus$="uses"]');
    if (catalog.index.usesItem[primary].length > 4) {
      assert(more, "Long reverse-use list requires a See more control"); more.click(); await settle();
      recipeButtons = [...lastPanel().querySelectorAll<HTMLButtonElement>('[data-inspector-kind="recipe"]')];
    }
    assert(recipeButtons.length > 20, "Expanded scroll fixture must exercise a long real reverse-use list");
    const recipeButton = recipeButtons.at(-5)!;
    recipeButton.scrollIntoView({ block: "nearest" }); recipeButton.focus({ preventScroll: true });
    body().dispatchEvent(new Event("scroll")); await settle();
    const saved = controller.getView(rootKey); assert(saved.scrollTop > 0, "Fixture must actually scroll");
    recipeButton.click(); await settle();
    assert(current().subject.kind === "recipe" && panels().length === 1, "Recipe must replace narrow inspector");
    const recipeKey = current().key;
    const recipe = catalog.recipes.find(record => record.id === current().subject.id)!;
    assert(lastPanel().querySelectorAll('[data-inspector-focus^="station:"]').length === recipe.stations.length, "Recipe lost its configured station links");
    const ingredient = [...lastPanel().querySelectorAll<HTMLButtonElement>('[data-inspector-focus^="input:"]')]
      .find(button => button.dataset.inspectorId !== primary);
    assert(ingredient, "Recipe requires a non-root ingredient/output relationship"); ingredient.click(); await settle();
    assert(controller.getSnapshot().entries.length === 3, "Item → recipe → related subject must retain three entries");
    if (current().subject.kind === "tag") {
      const heading = lastPanel().querySelector("h2")!;
      assert(heading.scrollWidth <= heading.clientWidth, "Long subject name overflows its header and Close control");
      const group = current().subject.id, members = catalog.index.tagMembers[group] ?? [];
      const memberButtons = [...lastPanel().querySelectorAll<HTMLButtonElement>('[data-inspector-focus^="member:"]')];
      assert(memberButtons.length === members.length, "Group UI does not match known source members");
      if (memberButtons.length) {
        const expected = memberButtons[0].dataset.inspectorId; memberButtons[0].click(); await settle();
        assert(current().subject.kind === "item" && current().subject.id === expected, "Group member did not open the exact item");
        await back(); assert(current().subject.id === group, "Member Back did not restore the ingredient group");
      }
    }
    await back(); assert(current().key === recipeKey, "First Back must restore recipe");
    await back(); assert(current().key === rootKey, "Second Back must restore root item");
    assert(Math.abs(body().scrollTop - saved.scrollTop) < 1, "Back lost root scroll position");
    assert((document.activeElement as HTMLElement)?.dataset.inspectorFocus === saved.focusKey, "Back lost relationship focus");
    checks.push("Real reverse recipe → related subject → Back restores identity, scroll and keyboard focus");
    checks.push("Configured station links and known ingredient-group members remain source-specific");

    const selected = lastPanel().querySelector<HTMLButtonElement>(`[data-inspector-id="${recipeButton.dataset.inspectorId}"][data-inspector-kind="recipe"]`)!;
    selected.click(); await settle();
    const beforeResize = current().key;
    // Larger diagnostic surface may extend beyond the browser. This tests container geometry, not monitor support.
    surface.style.width = "1700px"; await settle();
    assert(panels().length === 2, "Wide usable map must show root and companion");
    assert(current().key === beforeResize, "Resize changed the selected subject");
    assert(panels().every(panel => panel.getBoundingClientRect().width === 360), "Wide panel width differs from reference"); withinRail();
    assert(lastPanel().getBoundingClientRect().left - panels()[0].getBoundingClientRect().right === 12, "Companion gap must be 12px");
    const close = lastPanel().querySelector<HTMLButtonElement>("header button"); assert(close, "Missing companion Close"); close.click(); await settle();
    assert(panels().length === 1 && current().key === rootKey, "Companion Close must keep root");
    assert((document.activeElement as HTMLElement)?.dataset.inspectorFocus === saved.focusKey, "Companion Close lost root focus");
    checks.push("Measured wide layout retains root, 360px companion, 12px gap and rail isolation");

    surface.style.width = "800px"; await settle();
    assert(lastPanel().getBoundingClientRect().width === 336, "Small map must clamp panel to usable width"); withinRail();
    // The reference lets the native scrollbar consume right padding rather than narrow text.
    // Chromium's "thin" scrollbar is 10px here, not necessarily the WebKit CSS fallback's 8px.
    assert(body().scrollWidth <= body().offsetWidth, "Small panel content exceeds its actual scrollbar allowance");
    for (const row of lastPanel().querySelectorAll<HTMLElement>("[data-inspector-kind]"))
      assert(row.getBoundingClientRect().right <= body().getBoundingClientRect().left + body().clientWidth, "Scrollbar clips a relationship row");
    checks.push("336px available panel clamps without crossing the 440px rail");

    const blocked = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }); blocked.preventDefault();
    window.dispatchEvent(blocked); await settle(); assert(current().key === rootKey, "Consumed Escape must not close another layer");
    const listbox = document.createElement("div"); listbox.setAttribute("role", "listbox");
    listbox.style.cssText = "position:absolute;left:0;top:0;width:20px;height:20px"; surface.append(listbox);
    try {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); await settle();
      assert(current().key === rootKey, "Visible higher layer must own Escape");
      listbox.hidden = true;
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); await settle();
    } finally { listbox.remove(); }
    assert(panels().length === 0, "Root Escape must return to base");
    checks.push("Consumed Escape and visible higher layers are respected; hidden listboxes do not block Back");

    controller.open({ kind: "item", id: primary }); await settle(); const obsolete = current().key;
    controller.setContext({ ...initialContext, worldId: "diagnostic-other-world" }); await settle();
    controller.navigate(obsolete, { kind: "item", id: primary }); await settle();
    assert(panels().length === 0, "World switch or obsolete action leaked a detail panel");
    checks.push("World-context replacement clears mounted panels and rejects stale relationships");
    controller.setContext(initialContext); controller.open({ kind: "item", id: primary });
    for (let index = 1; index < 65; index++) controller.navigate(current().key, { kind: "item", id: `diagnostic:history-${index}` });
    await settle();
    assert(controller.getSnapshot().entries.length === 64 && lastPanel().querySelector('[role="alert"]'), "History limit must preserve the stack and explain why navigation stopped");
    await back(); assert(!lastPanel().querySelector('[role="alert"]'), "Back must clear the history-limit notice");
    checks.push("History safety bound shows a recoverable notice instead of an uncaught click error");
    return { status: "PASS", edition: initialContext.edition, version: initialContext.version, primary, checks,
      scope: "Browser component and container checks; no game data access, terrain generation, monitor or Overwolf verification" };
  } finally {
    surface.style.width = originalWidth;
    if (!signal?.aborted) { controller.setContext(initialContext); controller.close(); await settle(); }
  }
};
