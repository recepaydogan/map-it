import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { GAME_CUSTOM_FLAT_BLOCKS, GAME_CUSTOM_FLAT_LIMITS, GAME_CUSTOM_WORLD_BIOMES,
  GAME_CUSTOM_WORLD_EXPORTS, GAME_EDITIONS, GAME_WORLD_CATALOG, GAME_WORLD_MAP_PREVIEWS } from "../../game-config";
import MapSelectDropdown from "../map/map-select-dropdown";
import { parseSeedInput } from "./seed-value";
import { randomSeed } from "./seed-value";
import type { NewWorld } from "./world-types";
import WorldSeedControl from "./world-seed-control";

interface WorldFormProps {
  busy: boolean;
  onSave: (input: NewWorld) => void;
  initialWorld?: NewWorld | null;
  onExploreSeeds?: (edition: keyof typeof GAME_WORLD_CATALOG, version: string) => void;
  onPreview?: (input: NewWorld | null) => void;
  /** Development diagnostics may supply deterministic candidates; production uses secure random seeds. */
  drawSeed?: () => string;
}

const inputClass = "w-full rounded-[var(--radius-md)] border border-border bg-black/25 px-2.5 py-2 text-[13px] text-white outline-none focus:border-accent";
const presetsFor = (edition: keyof typeof GAME_WORLD_CATALOG, version: string) => GAME_WORLD_CATALOG[edition].presets
  .filter(preset => !("versions" in preset) || (preset.versions as readonly string[]).includes(version));

/** Creates a world descriptor whose selectable generation options all have an immediate map preview. */
const WorldForm = ({ busy, onSave, initialWorld, onExploreSeeds, onPreview, drawSeed = randomSeed }: WorldFormProps) => {
  const { t } = useTranslation();
  const [name, setName] = useState(() => initialWorld?.name ?? `${t("worlds.title")} ${GAME_WORLD_CATALOG.java.versions[0]}`);
  const [edition, setEdition] = useState<keyof typeof GAME_WORLD_CATALOG>(() =>
    GAME_EDITIONS.find(item => item.id === initialWorld?.edition)?.id ?? GAME_EDITIONS[0].id);
  const [version, setVersion] = useState<string>(() => initialWorld?.generation.version ?? GAME_WORLD_CATALOG[edition].versions[0]);
  const [preset, setPreset] = useState<string>(() => initialWorld?.generation.preset ?? GAME_WORLD_CATALOG[edition].presets[0].id);
  const [biome, setBiome] = useState<string>(GAME_CUSTOM_WORLD_BIOMES[0].id);
  const [baseBlock, setBaseBlock] = useState<string>("minecraft:dirt");
  const [baseHeight, setBaseHeight] = useState("2");
  const [surfaceBlock, setSurfaceBlock] = useState<string>("minecraft:grass_block");
  const [surfaceHeight, setSurfaceHeight] = useState("1");
  const [structures, setStructures] = useState(true);
  const [features, setFeatures] = useState(false);
  const [lakes, setLakes] = useState(false);
  const [seed, setSeed] = useState(() => initialWorld?.generation.seed ?? drawSeed());
  const [seedError, setSeedError] = useState(false);
  const catalog = GAME_WORLD_CATALOG[edition];
  const flatSettingsVisible = edition === "java" && preset === "flat";
  const baseHeightValue = Number(baseHeight), surfaceHeightValue = Number(surfaceHeight);
  const flatSettingsValid = !flatSettingsVisible || /^\d+$/.test(baseHeight) && /^\d+$/.test(surfaceHeight)
    && Number.isInteger(baseHeightValue) && Number.isInteger(surfaceHeightValue)
    && baseHeightValue >= GAME_CUSTOM_FLAT_LIMITS.minLayerHeight && surfaceHeightValue >= GAME_CUSTOM_FLAT_LIMITS.minLayerHeight
    && baseHeightValue <= GAME_CUSTOM_FLAT_LIMITS.maxLayerHeight && surfaceHeightValue <= GAME_CUSTOM_FLAT_LIMITS.maxLayerHeight
    && baseHeightValue + surfaceHeightValue <= GAME_CUSTOM_FLAT_LIMITS.maxConfiguredHeight;
  const customExportAvailable = GAME_CUSTOM_WORLD_EXPORTS.some(candidate => candidate.edition === edition
    && candidate.version === version && candidate.preset === preset);
  const previewInput = useMemo<NewWorld | null>(() => {
    const parsed = parseSeedInput(seed);
    if (parsed.kind !== "numeric" || !name.trim() || !flatSettingsValid) return null;
    let settings: Record<string, string | number | boolean> = {};
    if (preset === "single-biome") settings = { biome };
    else if (flatSettingsVisible) settings = { biome, baseBlock, baseHeight: baseHeightValue, surfaceBlock,
      surfaceHeight: surfaceHeightValue, structures, features, lakes };
    return { name: name.trim(), edition, generation: { version, seed: parsed.value, preset, settings } };
  }, [name, edition, version, preset, biome, baseBlock, baseHeightValue, surfaceBlock, surfaceHeightValue,
    structures, features, lakes, seed, flatSettingsValid, flatSettingsVisible]);
  useEffect(() => {
    onPreview?.(previewInput);
  }, [previewInput, onPreview]);
  useEffect(() => () => onPreview?.(null), [onPreview]);
  const pickEdition = (id: string) => {
    const entry = GAME_EDITIONS.find(item => item.id === id);
    if (!entry) return;
    const nextVersion = GAME_WORLD_CATALOG[entry.id].versions[0], nextPreset = GAME_WORLD_CATALOG[entry.id].presets[0].id;
    setEdition(entry.id);
    setVersion(nextVersion);
    setPreset(nextPreset);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseSeedInput(seed);
    if (parsed.kind !== "numeric") { setSeedError(true); return; }
    if (!name.trim() || busy) return;
    if (!flatSettingsValid) return;
    const input = previewInput;
    if (input) onSave(input);
  };
  const dropdown = (label: string, options: { id: string; name: string }[], value: string, onSelect: (id: string) => void) => (
    <div className="space-y-1.5">
      <span className="text-[12px] text-white/80">{label}</span>
      <MapSelectDropdown options={options} value={value} onSelect={onSelect}
        placeholder={label} ariaLabel={label} searchPlaceholder={label} noResultsLabel={t("worlds.noResults")} />
    </div>
  );
  return (
    <form onSubmit={submit} className="space-y-3 p-4">
      <fieldset disabled={busy} className="space-y-3 disabled:opacity-70">
        {onExploreSeeds && <button type="button" onClick={() => onExploreSeeds(edition, version)}
          className="flex w-full cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-accent/40 bg-accent/10 px-3 py-2 text-[12px] font-semibold text-accent hover:bg-accent/20">
          {t("worlds.exploreSeeds")}
        </button>}
        <label className="block space-y-1.5">
          <span className="text-[12px] text-white/80">{t("worlds.name")}</span>
          <input autoFocus required maxLength={200} value={name} aria-label={t("worlds.name")} onChange={event => setName(event.target.value)} className={inputClass} />
        </label>
        {dropdown(t("worlds.edition"), GAME_EDITIONS.map(item => ({ id: item.id, name: t(item.labelKey) })), edition, pickEdition)}
        {dropdown(t("worlds.version"), catalog.versions.map(id => ({ id, name: id })), version, id => {
          const nextPreset = presetsFor(edition, id).some(candidate => candidate.id === preset) ? preset : presetsFor(edition, id)[0]!.id;
          setVersion(id); setPreset(nextPreset);
        })}
        <p className="text-[11px] leading-4 text-zinc-200">{t(GAME_WORLD_MAP_PREVIEWS.some(item => item.edition === edition && (item.versions as readonly string[]).includes(version)) ? "biomeMap.notice" : "biomeMap.available", {
          versions: GAME_WORLD_MAP_PREVIEWS.find(item => item.edition === edition)?.versions.join(", ") ?? "—",
        })}</p>
        {dropdown(t("worlds.preset"), presetsFor(edition, version).map(item => ({ id: item.id, name: t(item.labelKey) })), preset, id => {
          setPreset(id);
        })}
        {preset === "single-biome" && <div className="space-y-2 rounded-[var(--radius-md)] border border-accent/35 bg-accent-soft p-3">
          {dropdown(t("worlds.biome"), GAME_CUSTOM_WORLD_BIOMES.map(item => ({ id: item.id, name: t(item.labelKey) })), biome, id => {
            setBiome(id);
          })}
          <p className="text-[10px] leading-4 text-zinc-200">{t("worlds.customExport.createNotice")}</p>
        </div>}
        {flatSettingsVisible && <div className="space-y-2.5 rounded-[var(--radius-md)] border border-accent/35 bg-accent-soft p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">{t("worlds.flatSettings.title")}</p>
          {dropdown(t("worlds.biome"), GAME_CUSTOM_WORLD_BIOMES.map(item => ({ id: item.id, name: t(item.labelKey) })), biome, id => {
            setBiome(id);
          })}
          {dropdown(t("worlds.flatSettings.baseBlock"), GAME_CUSTOM_FLAT_BLOCKS.map(item => ({ id: item.id, name: t(item.labelKey) })), baseBlock, id => {
            setBaseBlock(id);
          })}
          <label className="block space-y-1.5">
            <span className="text-[12px] text-white/80">{t("worlds.flatSettings.baseHeight")}</span>
            <input type="number" min={GAME_CUSTOM_FLAT_LIMITS.minLayerHeight} max={GAME_CUSTOM_FLAT_LIMITS.maxLayerHeight}
              value={baseHeight} aria-invalid={!flatSettingsValid} aria-label={t("worlds.flatSettings.baseHeight")}
              onChange={event => setBaseHeight(event.currentTarget.value)} className={inputClass} />
          </label>
          {dropdown(t("worlds.flatSettings.surfaceBlock"), GAME_CUSTOM_FLAT_BLOCKS.map(item => ({ id: item.id, name: t(item.labelKey) })), surfaceBlock, id => {
            setSurfaceBlock(id);
          })}
          <label className="block space-y-1.5">
            <span className="text-[12px] text-white/80">{t("worlds.flatSettings.surfaceHeight")}</span>
            <input type="number" min={GAME_CUSTOM_FLAT_LIMITS.minLayerHeight} max={GAME_CUSTOM_FLAT_LIMITS.maxLayerHeight}
              value={surfaceHeight} aria-invalid={!flatSettingsValid} aria-label={t("worlds.flatSettings.surfaceHeight")}
              onChange={event => setSurfaceHeight(event.currentTarget.value)} className={inputClass} />
          </label>
          {(["structures", "features", "lakes"] as const).map(key => {
            const value = key === "structures" ? structures : key === "features" ? features : lakes;
            const update = key === "structures" ? setStructures : key === "features" ? setFeatures : setLakes;
            return <label key={key} className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-sm)] border border-white/10 bg-black/15 px-2.5 py-2 text-[11px] leading-4 text-zinc-200">
              <input type="checkbox" checked={value} onChange={event => update(event.currentTarget.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]" />
              <span>{t(`worlds.flatSettings.${key}`)}</span>
            </label>;
          })}
          {!flatSettingsValid && <p role="alert" className="text-[10px] leading-4 text-danger-text">{t("worlds.flatSettings.heightError")}</p>}
          <p className="text-[10px] leading-4 text-zinc-200">{t(customExportAvailable ? "worlds.customExport.createNotice" : "worlds.customExport.unavailable")}</p>
        </div>}
        <WorldSeedControl seed={seed} invalid={seedError} disabled={busy}
          onChange={value => { setSeed(value); setSeedError(false); }} drawSeed={drawSeed} />
        {seedError && <p id="world-seed-error" role="alert" className="text-xs text-danger-text">{t("worlds.seedInvalid")}</p>}
        <p className="text-[11px] leading-4 text-white/80">{t("worlds.versionNotice")}</p>
        <button type="submit" data-tour="world-create" disabled={busy || !flatSettingsValid || parseSeedInput(seed).kind !== "numeric"}
          className="w-full cursor-pointer rounded-[var(--radius-md)] bg-accent px-3 py-2 text-[12px] font-semibold text-on-accent disabled:cursor-not-allowed disabled:text-white/70 disabled:opacity-70">
          {t("worlds.save")}
        </button>
      </fieldset>
    </form>
  );
};

export default WorldForm;
