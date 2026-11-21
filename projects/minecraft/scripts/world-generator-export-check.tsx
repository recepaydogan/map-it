import { useState } from "react";
import { createRoot } from "react-dom/client";
import { unzipSync } from "fflate";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import i18n from "../src/i18n";
import WorldActions from "../src/features/worlds/world-actions";
import WorldForm from "../src/features/worlds/world-form";
import type { NewWorld, WorldRecord } from "../src/features/worlds/world-types";
import "./world-generator-export-check.css";

const host = document.getElementById("root")!;
host.innerHTML = `<div class="generator-check-shell"><main class="generator-check-map"><div class="generator-check-panel"></div></main><aside class="generator-check-rail"><h1>Reserved advertising rail · 440px</h1><p>Uses production world controls and captures the local ZIP in memory.</p><button type="button">Run generator export checks</button><pre role="status">null</pre></aside></div>`;
const panel = host.querySelector<HTMLElement>(".generator-check-panel")!;
const rail = host.querySelector<HTMLElement>(".generator-check-rail")!;
const runButton = rail.querySelector<HTMLButtonElement>("button")!;
const report = rail.querySelector<HTMLElement>("pre")!;
const root = createRoot(panel);
let saved: NewWorld | null = null;
const readSaved = (): NewWorld | null => saved;

const record = (draft: NewWorld): WorldRecord => ({ schemaVersion: 1, id: "fixture", ...draft,
  association: null, favorite: false, createdAt: 1, lastOpenedAt: 1, movedToBottomAt: null,
  personal: { pins: [], favorites: [], found: [], notes: {}, tracked: [], views: {} } });
export const Diagnostic = () => {
  const [world, setWorld] = useState<WorldRecord | null>(null);
  return world ? <WorldActions world={world} busy={false} onRename={() => undefined} onMoveToBottom={() => undefined} onForget={() => undefined} />
    : <WorldForm busy={false} drawSeed={() => "35"} onSave={draft => { saved = draft; setWorld(record(draft)); }} />;
};
let renderRevision = 0;
const renderDiagnostic = () => { renderRevision++; root.render(<Diagnostic key={renderRevision} />); };
renderDiagnostic();

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const until = async (condition: () => boolean, description: string) => {
  const deadline = Date.now() + 15000;
  while (!condition()) { if (Date.now() > deadline) throw new Error(`Timed out: ${description}`); await wait(30); }
};
const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const setInput = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
const dropdown = (label: string) => panel.querySelector<HTMLButtonElement>(`button[aria-label="${CSS.escape(label)}"]`);
const select = async (label: string, value: string) => {
  const trigger = dropdown(label); assert(trigger, `Missing dropdown: ${label}`); trigger.click(); await wait(20);
  const option = [...panel.querySelectorAll<HTMLButtonElement>('button[role="option"]')].find(item => item.textContent?.trim() === value);
  assert(option, `Missing option ${value} in ${label}`); option.click(); await wait(20);
};
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
let running = false;

const run = async () => {
  if (running) return; running = true; runButton.disabled = true; report.textContent = "RUNNING";
  const checks: string[] = [];
  let capturedBlob: Blob | null = null, capturedName = "";
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL, originalClick = HTMLAnchorElement.prototype.click;
  try {
    await until(() => panel.querySelector<HTMLInputElement>(`input[aria-label="${CSS.escape(i18n.t("worlds.name"))}"]`) !== null, "world form");
    dropdown(i18n.t("worlds.preset"))!.click(); await wait(20);
    assert(![...panel.querySelectorAll('button[role="option"]')].some(item => item.textContent?.trim() === i18n.t("worlds.singleBiomePreset")),
      "Unsupported latest Java release exposed custom export");
    dropdown(i18n.t("worlds.preset"))!.click();
    await select(i18n.t("worlds.version"), "1.21.3");
    await select(i18n.t("worlds.preset"), i18n.t("worlds.singleBiomePreset"));
    await select(i18n.t("worlds.biome"), i18n.t("worlds.biomes.cherryGrove"));
    assert(panel.textContent?.includes(i18n.t("worlds.customExport.createNotice")), "Custom generator boundary is not disclosed");
    checks.push("Version gating exposes Single biome only for an exact export profile");

    setInput(panel.querySelector<HTMLInputElement>(`input[aria-label="${CSS.escape(i18n.t("worlds.name"))}"]`)!, "Snow / Cherry world");
    setInput(panel.querySelector<HTMLInputElement>(`input[aria-label="${CSS.escape(i18n.t("worlds.seed"))}"]`)!, "-9223372036854775808");
    panel.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await until(() => panel.querySelector("[data-generator-export]") !== null, "world actions export");
    assert(saved?.generation.preset === "single-biome" && saved.generation.settings.biome === "minecraft:cherry_grove",
      "World descriptor lost the custom generator identity");
    assert(panel.textContent?.includes(i18n.t("worlds.biomes.cherryGrove")), "Manage pane lost the selected biome");
    checks.push("World storage identity retains preset, biome and signed 64-bit seed");

    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: (blob: Blob) => { capturedBlob = blob; return "blob:generator-check"; } });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    HTMLAnchorElement.prototype.click = function () { capturedName = this.download; };
    panel.querySelector<HTMLButtonElement>("[data-generator-export]")!.click();
    await until(() => capturedBlob !== null, "captured generator ZIP");
    const archiveBytes = new Uint8Array(await capturedBlob!.arrayBuffer());
    const files = unzipSync(archiveBytes);
    const metadata = JSON.parse(decode(files["pack.mcmeta"]));
    const preset = JSON.parse(decode(files["data/minecraft/worldgen/world_preset/single_biome_surface.json"]));
    assert(metadata.pack.pack_format === 57 && preset.dimensions["minecraft:overworld"].generator.biome_source.biome === "minecraft:cherry_grove",
      "Downloaded pack does not match its exact version/biome context");
    assert(decode(files["README.txt"]).includes("-9223372036854775808") && !Object.keys(files).some(path => /region|level\.dat|\.mca$/i.test(path)),
      "Archive fabricated chunks or lost its exact installation seed");
    assert(capturedName === "snow-cherry-world-java-1-21-3-single-biome.zip", "Download filename is unsafe or unstable");
    checks.push("Downloaded ZIP contains exact pack metadata, official preset shape and install instructions without chunks");

    capturedBlob = null; capturedName = ""; saved = null; renderDiagnostic();
    await until(() => panel.querySelector<HTMLInputElement>(`input[aria-label="${CSS.escape(i18n.t("worlds.name"))}"]`) !== null, "fresh flat-world form");
    await select(i18n.t("worlds.version"), "1.21.3");
    await select(i18n.t("worlds.preset"), i18n.t("worlds.flatPreset"));
    await select(i18n.t("worlds.biome"), i18n.t("worlds.biomes.snowyPlains"));
    const baseHeightInput = panel.querySelector<HTMLInputElement>(`input[aria-label="${CSS.escape(i18n.t("worlds.flatSettings.baseHeight"))}"]`)!;
    const surfaceHeightInput = panel.querySelector<HTMLInputElement>(`input[aria-label="${CSS.escape(i18n.t("worlds.flatSettings.surfaceHeight"))}"]`)!;
    setInput(baseHeightInput, "382"); setInput(surfaceHeightInput, "2"); await wait(20);
    assert(panel.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled
      && panel.textContent?.includes(i18n.t("worlds.flatSettings.heightError")),
    "Over-height Flat settings remained saveable or lacked an explanation");
    checks.push("Custom Flat rejects layer totals above the bounded vertical budget");
    await select(i18n.t("worlds.flatSettings.baseBlock"), i18n.t("worlds.blocks.deepslate"));
    setInput(baseHeightInput, "24");
    await select(i18n.t("worlds.flatSettings.surfaceBlock"), i18n.t("worlds.blocks.snowBlock"));
    setInput(surfaceHeightInput, "3");
    const lakeLabel = [...panel.querySelectorAll<HTMLLabelElement>("label")]
      .find(item => item.textContent?.includes(i18n.t("worlds.flatSettings.lakes")));
    assert(lakeLabel, "Missing flat-world lakes control");
    lakeLabel.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    setInput(panel.querySelector<HTMLInputElement>(`input[aria-label="${CSS.escape(i18n.t("worlds.name"))}"]`)!, "Builder's world");
    setInput(panel.querySelector<HTMLInputElement>(`input[aria-label="${CSS.escape(i18n.t("worlds.seed"))}"]`)!, "9223372036854775807");
    panel.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await until(() => panel.querySelector("[data-generator-export]") !== null, "flat-world actions export");
    const flatSaved = readSaved();
    assert(flatSaved?.generation.preset === "flat" && flatSaved.generation.settings.baseBlock === "minecraft:deepslate"
      && flatSaved.generation.settings.baseHeight === 24 && flatSaved.generation.settings.surfaceBlock === "minecraft:snow_block"
      && flatSaved.generation.settings.surfaceHeight === 3 && flatSaved.generation.settings.lakes === true,
    "World descriptor lost custom flat settings");
    checks.push("Custom Flat stores bounded layer, biome, structure, feature and lake settings in world identity");

    panel.querySelector<HTMLButtonElement>("[data-generator-export]")!.click();
    await until(() => capturedBlob !== null, "captured flat generator ZIP");
    const flatFiles = unzipSync(new Uint8Array(await capturedBlob!.arrayBuffer()));
    const flatMetadata = JSON.parse(decode(flatFiles["pack.mcmeta"]));
    const flatPreset = JSON.parse(decode(flatFiles["data/minecraft/worldgen/world_preset/flat.json"]));
    const flatSettings = flatPreset.dimensions["minecraft:overworld"].generator.settings;
    assert(flatMetadata.pack.pack_format === 57 && flatSettings.biome === "minecraft:snowy_plains"
      && flatSettings.layers[1].block === "minecraft:deepslate" && flatSettings.layers[1].height === 24
      && flatSettings.layers[2].block === "minecraft:snow_block" && flatSettings.layers[2].height === 3
      && flatSettings.lakes === true && flatSettings.features === false
      && flatSettings.structure_overrides.join(",") === "minecraft:strongholds,minecraft:villages",
    "Downloaded flat pack does not match its stored settings");
    assert(decode(flatFiles["README.txt"]).includes("9223372036854775807")
      && !Object.keys(flatFiles).some(path => /region|level\.dat|\.mca$/i.test(path)),
    "Flat archive fabricated chunks or lost its exact installation seed");
    assert(capturedName === "builder-s-world-java-1-21-3-flat.zip", "Flat download filename is unsafe or unstable");
    checks.push("Downloaded Flat ZIP matches the official preset shape and exact saved settings without chunks");

    const edge = rail.getBoundingClientRect().left;
    for (const control of panel.querySelectorAll<HTMLElement>("button,input"))
      assert(control.getBoundingClientRect().right <= edge, "A generator control crossed the 440px advertising rail");
    assert(panel.getBoundingClientRect().width === 304, "Generator flow changed the ER selector-panel width");
    checks.push("Production controls retain the 304px panel and 440px rail boundary");
    report.textContent = JSON.stringify({ status: "PASS", checks,
      scope: "Synthetic descriptor and in-memory download only; no app database, game save, pack installation or game launch" }, null, 2);
  } catch (error) {
    report.textContent = JSON.stringify({ status: "FAIL", error: error instanceof Error ? error.stack : String(error) }, null, 2);
  } finally {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreate });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevoke });
    HTMLAnchorElement.prototype.click = originalClick;
    running = false; runButton.disabled = false;
  }
};

runButton.addEventListener("click", () => { void run(); });
if (new URLSearchParams(location.search).has("autorun")) await run();
