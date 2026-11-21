import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { GAME_CUSTOM_FLAT_BLOCKS, GAME_CUSTOM_WORLD_BIOMES, GAME_EDITIONS, GAME_WORLD_CATALOG } from "../../game-config";
import { cn } from "../../lib/cn";
import type { WorldRecord } from "./world-types";
import { downloadWorldGeneratorExport, resolveWorldGeneratorExport } from "./world-generator-export";

interface WorldActionsProps {
  world: WorldRecord;
  busy: boolean;
  onRename: (name: string) => void;
  onMoveToBottom: () => void;
  onForget: () => void;
}

const actionClass = "w-full cursor-pointer rounded-[var(--radius-md)] border border-border bg-white/5 px-3 py-2 text-left text-[12px] text-zinc-100 hover:bg-white/10 disabled:cursor-wait";

const WorldActions = ({ world, busy, onRename, onMoveToBottom, onForget }: WorldActionsProps) => {
  const { t } = useTranslation();
  const [name, setName] = useState(world.name);
  const [copyStatus, setCopyStatus] = useState<"copied" | "copyFailed" | null>(null);
  const [exportStatus, setExportStatus] = useState<"downloaded" | "failed" | null>(null);
  const catalog = GAME_WORLD_CATALOG[world.edition as keyof typeof GAME_WORLD_CATALOG];
  const preset = catalog?.presets.find(candidate => candidate.id === world.generation.preset);
  const generatorExport = resolveWorldGeneratorExport(world);
  const biome = world.generation.preset === "single-biome" || world.generation.preset === "flat"
    ? GAME_CUSTOM_WORLD_BIOMES.find(candidate => candidate.id === world.generation.settings.biome) ?? null
    : null;
  const baseBlock = world.generation.preset === "flat"
    ? GAME_CUSTOM_FLAT_BLOCKS.find(candidate => candidate.id === world.generation.settings.baseBlock) ?? null : null;
  const surfaceBlock = world.generation.preset === "flat"
    ? GAME_CUSTOM_FLAT_BLOCKS.find(candidate => candidate.id === world.generation.settings.surfaceBlock) ?? null : null;
  const copySeed = async () => {
    try { await navigator.clipboard.writeText(world.generation.seed); setCopyStatus("copied"); }
    catch (error) { console.error("[World library] Seed copy failed", error); setCopyStatus("copyFailed"); }
  };
  const exportGenerator = () => {
    if (!generatorExport || !biome) return;
    try {
      const edition = GAME_EDITIONS.find(candidate => candidate.id === world.edition);
      const isFlat = generatorExport.kind === "flat";
      downloadWorldGeneratorExport(world, {
        packDescription: t(isFlat ? "worlds.customExport.flatPackDescription" : "worlds.customExport.packDescription",
          { biome: t(biome.labelKey), version: world.generation.version }),
        instructions: t(isFlat ? "worlds.customExport.flatInstructions" : "worlds.customExport.instructions", { world: world.name,
          edition: t(edition?.labelKey ?? "worlds.edition"), version: world.generation.version,
          seed: world.generation.seed, biome: t(biome.labelKey),
          baseBlock: isFlat ? t(generatorExport.baseBlock.labelKey) : "", baseHeight: isFlat ? generatorExport.options.baseHeight : "",
          surfaceBlock: isFlat ? t(generatorExport.surfaceBlock.labelKey) : "", surfaceHeight: isFlat ? generatorExport.options.surfaceHeight : "",
          structures: isFlat ? t(generatorExport.options.structures ? "worlds.enabled" : "worlds.disabled") : "",
          features: isFlat ? t(generatorExport.options.features ? "worlds.enabled" : "worlds.disabled") : "",
          lakes: isFlat ? t(generatorExport.options.lakes ? "worlds.enabled" : "worlds.disabled") : "" }),
      });
      setExportStatus("downloaded");
    } catch (error) {
      console.error("[World library] Generator export failed", error); setExportStatus("failed");
    }
  };
  return (
    <div className="space-y-3 p-4">
      <form onSubmit={event => { event.preventDefault(); if (!busy && name.trim()) onRename(name.trim()); }} className="space-y-2">
        <label className="block space-y-1.5">
          <span className="text-[12px] text-white/80">{t("worlds.name")}</span>
          <input autoFocus required maxLength={200} disabled={busy} value={name} onChange={event => setName(event.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-border bg-black/25 px-2.5 py-2 text-[13px] text-white outline-none focus:border-accent" />
        </label>
        <button type="submit" disabled={busy || name.trim() === world.name} className={actionClass}>{t("worlds.rename")}</button>
      </form>
      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-[12px] text-zinc-300">{t("worlds.preset")}: {preset ? t(preset.labelKey) : world.generation.preset}</p>
        {biome && <p className="text-[12px] text-zinc-300">{t("worlds.biome")}: {t(biome.labelKey)}</p>}
        {baseBlock && surfaceBlock && <p className="text-[11px] leading-4 text-zinc-300">
          {t("worlds.flatSettings.layerSummary", { baseHeight: world.generation.settings.baseHeight, baseBlock: t(baseBlock.labelKey),
            surfaceHeight: world.generation.settings.surfaceHeight, surfaceBlock: t(surfaceBlock.labelKey) })}
        </p>}
        <p className="break-all text-[12px] text-zinc-300">{t("worlds.seed")}: {world.generation.seed}</p>
        <button type="button" className={actionClass} onClick={() => { void copySeed(); }}>{t("worlds.copySeed")}</button>
        {copyStatus && <p role="status" className="text-xs text-white/80">{t(`worlds.${copyStatus}`)}</p>}
        {generatorExport && <button type="button" data-generator-export disabled={busy} className={cn(actionClass, "flex items-center gap-2")}
          onClick={exportGenerator}><Download size={14} className="text-accent" aria-hidden="true" />{t("worlds.customExport.action")}</button>}
        {world.edition === "java" && (world.generation.preset === "single-biome" || world.generation.preset === "flat") && !generatorExport
          && <p role="status" className="text-[11px] leading-4 text-zinc-200">
          {t("worlds.customExport.unavailable")}
        </p>}
        {exportStatus && <p role={exportStatus === "failed" ? "alert" : "status"}
          className={exportStatus === "failed" ? "text-xs text-danger-text" : "text-xs text-success-text"}>
          {t(`worlds.customExport.${exportStatus}`)}
        </p>}
        <button type="button" disabled={busy} className={actionClass} onClick={onMoveToBottom}>{t("worlds.moveBottom")}</button>
        <button type="button" disabled={busy} className="w-full cursor-pointer rounded-[var(--radius-md)] border border-danger/40 px-3 py-2 text-left text-[12px] text-danger-text hover:bg-danger/10" onClick={onForget}>{t("worlds.forget")}</button>
      </div>
    </div>
  );
};

export default WorldActions;
