import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LocateFixed, UserRound } from "lucide-react";
import Dropdown from "../../components/dropdown";
import MapActionButton from "../../components/map-action-button";
import { isOverwolf } from "../../utils/overwolf";
import { subscribeSaveReader } from "./save-reader-client";
import { selectedCharacter, useSaveTracking } from "./save-tracking-store";
import { projectSavedPosition } from "./save-position-projection";

const SaveTrackingControls = () => {
  const { t } = useTranslation();
  const state = useSaveTracking();
  const character = selectedCharacter(state);
  const position = projectSavedPosition(character);
  useEffect(() => {
    if (!isOverwolf()) return;
    return subscribeSaveReader();
  }, []);
  if (!isOverwolf()) return null;

  let status: string | null = null;
  if (state.state === "error") status = t("saveTracking.error");
  else if (state.state === "waiting") status = t("saveTracking.waiting");
  else if (state.state === "no-save") status = t("saveTracking.noSave");
  else if (state.state === "loading") status = t("saveTracking.loading");
  else if (state.state === "retry") status = t("saveTracking.retry");
  else if (!character) status = t("saveTracking.chooseCharacter");
  else if (!position) status = t("saveTracking.unavailable");

  return (
    <div className="pointer-events-auto flex max-w-full flex-col items-start gap-1">
      <div className="flex max-w-full items-center gap-1.5">
        <Dropdown
          icon={UserRound}
          caption={t("saveTracking.character")}
          value={state.selectedId}
          options={[
            { value: "", label: character && !state.selectedId ? t("saveTracking.autoCharacter", { name: character.name }) : t("saveTracking.auto") },
            ...state.characters.map((item) => ({ value: item.id, label: t("saveTracking.characterSlot", { name: item.name, slot: item.slot }) })),
          ]}
          onChange={state.select}
          className="max-w-64 bg-surface/95"
        />
        <MapActionButton onClick={state.focus} disabled={!position} aria-label={t("saveTracking.locate")} title={t("saveTracking.locate")}>
          <LocateFixed size={16} aria-hidden="true" />
        </MapActionButton>
      </div>
      {status && (
        <span role="status" className="max-w-72 rounded-md border border-border bg-surface/95 px-2 py-1 text-[11px] text-white/90">
          {status}
        </span>
      )}
    </div>
  );
};

export default SaveTrackingControls;
