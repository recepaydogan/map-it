import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { contentUrl } from "../lib/content-url";
import SpellLink from "../features/spells/spell-link";
import Tooltip from "./tooltip";
import { splitSpellTokens } from "./inline-spell-tokens";

interface InlineAbility {
  id?: string | number;
  name: string;
  description: string;
  icon?: string;
  level?: number;
}

const InlineAbilityLinks = ({ text, abilities, protectedNames = [], renderText = (value: string) => value }: {
  text: string;
  abilities: InlineAbility[];
  protectedNames?: string[];
  renderText?: (value: string) => ReactNode;
}) => {
  const { t } = useTranslation();
  const explicit = splitSpellTokens(text);
  if (explicit.some((part) => "id" in part)) return <>{explicit.map((part, index) =>
    "id" in part ? <SpellLink key={index} id={part.id} name={part.name}
      wrapperClassName="inline-block align-baseline"
      className="guide-inline-ability inline-block align-baseline cursor-pointer font-medium text-accent hover:brightness-125 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
    >{part.name}</SpellLink> : <InlineAbilityLinks key={index} text={part.text} abilities={abilities}
      protectedNames={protectedNames} renderText={renderText} />
  )}</>;
  const matched = abilities.filter((ability) => ability.name && (ability.description || ability.id) && text.includes(ability.name))
    .sort((a, b) => b.name.length - a.name.length);
  if (!matched.length) return <>{renderText(text)}</>;
  const names = [...new Set([...matched.map((ability) => ability.name), ...protectedNames.filter((name) => text.includes(name))])]
    .sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`, "gu");
  return <>{text.split(pattern).map((part, index) => {
    const ability = matched.find((candidate) => candidate.name === part);
    if (ability?.id && Number.isInteger(Number(ability.id))) return <SpellLink key={`${part}-${index}`} id={Number(ability.id)} name={ability.name}
      wrapperClassName="inline-block align-baseline"
      className="guide-inline-ability inline-block align-baseline cursor-pointer font-medium text-accent hover:brightness-125 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent">
      {ability.icon && <img src={contentUrl(ability.icon)} alt="" className="mr-1 inline-block size-3.5 align-middle rounded-[2px] object-cover" />}{part}
    </SpellLink>;
    return ability ? <Tooltip key={`${part}-${index}`} wrap align="start" side="top" className="inline-block align-baseline"
      label={<span className="block max-w-[14rem] text-left">
        <span className="flex items-center gap-1.5 font-semibold text-accent">{ability.icon && <img src={contentUrl(ability.icon)} alt="" className="size-5 rounded-sm object-cover" />}{ability.name}</span>
        {ability.level !== undefined && <span className="mt-0.5 block font-normal text-subtle">{t("classes.level", { level: ability.level })}</span>}
        <span className="mt-1 block font-normal leading-relaxed text-zinc-200">{ability.description}</span>
      </span>}>
      <span tabIndex={0} className="guide-inline-ability inline-block align-baseline cursor-help font-medium text-accent focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent">
        {ability.icon && <img src={contentUrl(ability.icon)} alt="" className="mr-1 inline-block size-3.5 align-middle rounded-[2px] object-cover" />}{part}
      </span>
    </Tooltip> : <Fragment key={index}>{renderText(part)}</Fragment>;
  })}</>;
};

export default InlineAbilityLinks;
