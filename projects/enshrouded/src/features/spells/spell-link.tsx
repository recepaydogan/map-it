import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../components/tooltip";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import { getSpellDescription } from "./spell-description";
import SpellIcon from "./spell-icon";
import { spellIconUrl, useSpellDetail } from "./spell-data";

const InlineSpellIcon = ({ iconId }: { iconId: number }) => {
  const [failed, setFailed] = useState(false);
  return failed ? null : <img src={spellIconUrl(iconId)} alt="" aria-hidden="true"
    className="mr-1 inline-block size-3.5 align-middle rounded-[2px] object-cover"
    onError={() => setFailed(true)} />;
};

const SpellLink = ({ id, name, children, className, wrapperClassName, inlineIconId, showIcon = false }: { id: number; name: string; children?: ReactNode; className?: string; wrapperClassName?: string; inlineIconId?: number; showIcon?: boolean }) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const [preview, setPreview] = useState(false);
  const { detail } = useSpellDetail(showIcon || preview ? id : null);
  const description = getSpellDescription(detail?.d, detail?.a);
  return <Tooltip wrap align="start" side="top" className={wrapperClassName} label={<span className="block max-w-[16rem] text-left">
    <span className="flex items-center gap-2 font-semibold text-accent"><SpellIcon id={detail?.ic} name={name} size={26} />{name}{detail?.r && <span className="font-normal text-subtle">{detail.r}</span>}</span>
    {detail && <span className="mt-1.5 block font-normal text-zinc-300">{detail.co?.map(([amount, resource, percent]) => percent ? `${amount}% ${t("spells.ofBase")} ${resource}` : `${amount} ${resource}`).join(" · ")}{detail.co?.length && detail.rg ? " · " : ""}{detail.rg ? `${detail.rg[1]} yd` : ""}{detail.pa ? ` · ${t("spells.passive")}` : detail.ct === 0 ? ` · ${t("spells.instant")}` : ""}</span>}
    {description && <span className="mt-1.5 block font-normal leading-5 text-zinc-200">{description}</span>}
    {!detail && <span className="mt-1 block font-normal text-subtle">{t("spells.openDetail")}</span>}
  </span>}>
    <button type="button" onPointerEnter={() => setPreview(true)} onFocus={() => setPreview(true)}
      onClick={() => openReference({ category: "spells", id: String(id), name })}
      className={className ?? `${showIcon ? "inline-flex items-center gap-2 align-middle" : ""} cursor-pointer text-accent underline decoration-accent/60 underline-offset-2 hover:brightness-125 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent`}>
      {showIcon ? <SpellIcon id={detail?.ic} name={name} size={24} /> : inlineIconId ? <InlineSpellIcon key={inlineIconId} iconId={inlineIconId} /> : null}{children ?? name}
    </button>
  </Tooltip>;
};

export default SpellLink;
