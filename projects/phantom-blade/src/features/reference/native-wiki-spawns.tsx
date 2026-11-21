import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNativeJson, type NativeSpawnAnchor } from "./use-native-wiki";

const SceneEvidence = ({ path }: { path: string }) => {
  const { t } = useTranslation();
  const state = useNativeJson<unknown>(`data/game-files/build-26266538/scenes/${path}`);
  if (state.status !== "ready") return <p role={state.status === "error" ? "alert" : "status"}>{t(`reference.${state.status === "error" ? "error" : "loading"}`)}</p>;
  return <pre className="scroll-slim mt-3 max-h-[600px] overflow-auto whitespace-pre-wrap break-words text-[11px] text-zinc-300">{JSON.stringify(state.data, null, 2)}</pre>;
};

export default function NativeWikiSpawns({ anchors }: { anchors: NativeSpawnAnchor[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  return <div className="space-y-3"><p className="text-xs leading-relaxed text-subtle">{t(anchors.some(anchor => anchor.kind === "loot-container") ? "wiki.containerBoundary" : "wiki.spawnBoundary")}</p>
    {anchors.map((anchor, index) => <details key={anchor.id} className="rounded border border-border p-3" onToggle={event => {
      if (event.currentTarget.open) setExpanded(current => new Set([...current, anchor.id]));
    }}><summary className="cursor-pointer text-xs text-subtle">{anchor.kind === "loot-container" ? t("wiki.containerLoot") : t("wiki.spawnPoint", { index: index + 1 })}</summary>
      <p className="mt-3 break-all text-[11px] text-muted">{anchor.source}{anchor.source_pointer}</p>
      <pre className="mt-3 overflow-auto text-[11px] text-zinc-300">{JSON.stringify({ position: anchor.world_location, conditions: anchor.native_conditions, domain: anchor.native_domain_fields, container: anchor.native_fields }, null, 2)}</pre>
      {expanded.has(anchor.id) && <SceneEvidence path={anchor.evidence_file} />}
    </details>)}
  </div>;
}
