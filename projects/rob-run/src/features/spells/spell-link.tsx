import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import Tooltip from "../../components/tooltip";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import { getSpellDescription } from "./spell-description";
import { useLocalizedSpellText } from "./spell-locales";
import SpellIcon from "./spell-icon";
import { spellIconUrl, useSpellDetail } from "./spell-data";

const InlineSpellIcon = ({ iconId }: { iconId: number }) => {
  const [failed, setFailed] = useState(false);
  return failed ? null : <img src={spellIconUrl(iconId)} alt="" aria-hidden="true"
    className="mr-1 inline-block size-3.5 align-middle rounded-[2px] object-cover"
    onError={() => setFailed(true)} />;
};

const SpellLink = ({ id, name, rank, children, className, wrapperClassName, inlineIconId, showIcon = false, iconSize = 24, previewNote }: {
  id: number; name: string; rank?: string; children?: ReactNode; className?: string; wrapperClassName?: string;
  inlineIconId?: number; showIcon?: boolean; iconSize?: number; previewNote?: string;
}) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const localizedSpellText = useLocalizedSpellText();
  const openReference = useReferenceNavigation();
  const [preview, setPreview] = useState(false);
  const { detail } = useSpellDetail(showIcon || preview ? id : null);
  const localizedName = gameText(detail?.n ?? name, `SpellName:${id}:0`);
  const translatedDetail = localizedSpellText(id);
  const rankValue = translatedDetail?.r ?? rank ?? detail?.r;
  const rankMatch = rankValue && /^Rank (\d+)$/.exec(rankValue);
  const localizedRank = rankMatch ? t("spells.rank", { rank: Number(rankMatch[1]) }) : rankValue;
  const description = getSpellDescription(translatedDetail?.d ?? detail?.d,
    translatedDetail?.a ?? detail?.a);
  return <Tooltip wrap align="start" side="top" className={wrapperClassName} label={<span className="block max-w-[16rem] text-left">
    <span className="flex items-center gap-2 font-semibold text-accent"><SpellIcon id={detail?.ic} name={localizedName} size={26} />{localizedName}{localizedRank && <span className="font-normal text-subtle">{localizedRank}</span>}</span>
    {detail && <span className="mt-1.5 block font-normal text-zinc-300">{detail.co?.map(([amount, resource, percent]) => percent ? `${amount.toLocaleString(i18n.language)}% ${t("spells.ofBase")} ${gameText(resource)}` : `${amount.toLocaleString(i18n.language)} ${gameText(resource)}`).join(" · ")}{detail.co?.length && detail.rg ? " · " : ""}{detail.rg ? t("spells.mapPanel.yards", { value: detail.rg[1].toLocaleString(i18n.language) }) : ""}{detail.pa ? ` · ${t("spells.passive")}` : detail.ct === 0 ? ` · ${t("spells.instant")}` : ""}</span>}
    {description && <span className="mt-1.5 block font-normal leading-5 text-zinc-200">{description}</span>}
    {previewNote && <span className="mt-1 block font-normal text-subtle">{previewNote}</span>}
    {!detail && <span className="mt-1 block font-normal text-subtle">{t("spells.openDetail")}</span>}
  </span>}>
    <button type="button" onPointerEnter={() => setPreview(true)} onFocus={() => setPreview(true)}
      onClick={() => openReference({ category: "spells", id: String(id), name: localizedName })}
      className={className ?? `${showIcon ? "inline-flex items-center gap-2 align-middle" : ""} cursor-pointer text-accent underline decoration-accent/60 underline-offset-2 hover:brightness-125 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent`}>
      {showIcon ? <SpellIcon id={detail?.ic} name={localizedName} size={iconSize} /> : inlineIconId ? <InlineSpellIcon key={inlineIconId} iconId={inlineIconId} /> : null}{children ?? <>{localizedName}{rank && ` (${localizedRank})`}</>}
    </button>
  </Tooltip>;
};

export default SpellLink;
