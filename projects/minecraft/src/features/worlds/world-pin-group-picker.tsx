import { Check, Plus, Tag } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { MARKER_GROUPS } from "../map/marker-group-config";
import { createCustomWorldPinGroup, customWorldPinGroupName } from "./world-pin-group";

const WorldPinGroupPicker = ({ group, availableGroups, onChange }: {
  group: string;
  availableGroups: readonly string[];
  onChange: (group: string) => void;
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const fixed = new Set<string>(MARKER_GROUPS.map(item => item.id));
  const customGroups = [...new Set([...availableGroups, group])]
    .filter(item => !fixed.has(item) && customWorldPinGroupName(item));
  const add = () => {
    const next = createCustomWorldPinGroup(name);
    if (!next) return;
    onChange(next); setName("");
  };
  return <div className="map-marker-group-picker">
    <p className="map-micro-label">{t("map.markerGroups.group")}</p>
    <div className="map-marker-group-options">
      {MARKER_GROUPS.map(({ id, icon: Icon }) => <button key={id} type="button" onClick={() => onChange(id)}
        className={cn("map-marker-group-option", group === id && "map-marker-group-option-active")} aria-pressed={group === id}>
        <Icon size={13} aria-hidden="true" /><span>{t(`map.markerGroups.${id}`)}</span>
        {group === id && <Check size={11} className="ml-auto" aria-hidden="true" />}
      </button>)}
      {customGroups.map(id => <button key={id} type="button" onClick={() => onChange(id)}
        className={cn("map-marker-group-option", group === id && "map-marker-group-option-active")} aria-pressed={group === id}>
        <Tag size={13} aria-hidden="true" /><span className="truncate">{customWorldPinGroupName(id)}</span>
        {group === id && <Check size={11} className="ml-auto" aria-hidden="true" />}
      </button>)}
      <div className="map-marker-group-option cursor-text gap-[2px] p-0 pl-2">
        <Tag size={13} className="shrink-0" aria-hidden="true" />
        <input value={name} maxLength={60}
          className="min-w-0 flex-1 bg-transparent px-1 text-[11px] font-semibold text-inherit outline-none placeholder:text-[10px] placeholder:font-medium placeholder:text-current placeholder:opacity-50"
          placeholder={t("map.markerGroups.addCustom")} aria-label={t("map.markerGroups.addCustom")}
          onChange={event => setName(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
        <button type="button" disabled={!name.trim()} onClick={add}
          className="grid h-[23px] w-6 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] border-l border-white/10 text-current hover:bg-white/10 disabled:cursor-default disabled:opacity-35"
          aria-label={t("map.markerGroups.addCustom")} title={t("map.markerGroups.addCustom")}><Plus size={13} /></button>
      </div>
    </div>
  </div>;
};

export default WorldPinGroupPicker;
