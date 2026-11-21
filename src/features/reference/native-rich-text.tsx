import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { contentUrl } from "../../lib/content-url";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import { humanizeNativeLabel } from "./native-wiki-labels";
import { useNativeJson } from "./use-native-wiki";
import { parseNativeRichText, type NativeGlyph, type NativeTextData } from "./native-rich-text-model";

const Glyph = ({ glyph, label }: { glyph: NativeGlyph; label: string }) => <img src={contentUrl(glyph.icon)} alt={label}
  title={label} className="mx-0.5 inline-block h-7 max-w-12 object-contain align-middle" width={Math.round(28 * glyph.width / glyph.height)} height={28} />;

const NativeRichText = ({ value }: { value: string }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const state = useNativeJson<NativeTextData>("data/wiki/weapon-presentation.json");
  const data = state.status === "ready" ? state.data : undefined;
  return <>{parseNativeRichText(value).map((token, index) => {
    if (token.kind === "text") return <span key={index} className={cn(token.tone === "number" && "font-medium text-forever-blue", token.tone === "emphasis" && "font-medium text-zinc-100")}>{token.text}</span>;
    if (token.kind === "value") {
      const amount = data?.values[token.id];
      return <span key={index} className="font-medium tabular-nums text-forever-blue">{typeof amount === "number" ? amount.toLocaleString(i18n.language, { maximumSignificantDigits: 15 }) : amount ?? "—"}</span>;
    }
    if (token.kind === "input") {
      const action = data?.actions[token.id];
      const label = action?.label ? gameText(action.label) : t(`wiki.inputActions.${token.id}`, { defaultValue: humanizeNativeLabel(token.id) });
      const Direction = ({ Left: ArrowLeft, Right: ArrowRight, Forward: ArrowUp, Backward: ArrowDown } as Record<string, typeof ArrowLeft>)[token.direction ?? ""];
      return <span key={index} className="inline-flex items-center align-middle">{Direction && <Direction size={14} aria-label={t(`wiki.inputDirections.${token.direction}`)} />}{action?.glyphs.length ? action.glyphs.map((glyph, glyphIndex) => <Glyph key={glyphIndex} glyph={glyph} label={label} />)
        : <kbd className="mx-1 rounded-[var(--radius-sm)] border border-border px-1.5 py-0.5 font-sans text-xs text-zinc-100">{label}</kbd>}</span>;
    }
    const glyph = token.kind === "image" ? data?.images[token.id] : data?.particles[token.id];
    const label = glyph?.labelKey ? t(glyph.labelKey) : t(`wiki.weapon.resources.${token.id}`, { defaultValue: humanizeNativeLabel(token.id) });
    return glyph ? <Glyph key={index} glyph={glyph} label={label} /> : <span key={index} className="mx-1 text-zinc-200">{label}</span>;
  })}</>;
};
export default NativeRichText;
