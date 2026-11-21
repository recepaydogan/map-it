import { useTranslation } from "react-i18next";
import type { StaggerMove } from "./types";

/**
 * Wording for a stance-break figure, shared by the summary line and the
 * move-comparison grid so the same move is never described two ways in one card.
 *
 * The COUNT is deliberately not part of these strings. Both surfaces render the
 * numeral themselves in the display face (Cinzel), which is engraved Roman caps
 * — beautiful on "2", and it turns any word beside it into shouted capitals.
 * So the number and its unit are separate elements in separate faces, and this
 * only supplies the unit, correctly pluralised for the language.
 */
export const useStaggerLabels = () => {
  const { t, i18n } = useTranslation();
  const numberFormat = new Intl.NumberFormat(i18n.resolvedLanguage, {
    maximumFractionDigits: 1,
  });
  const pluralRules = new Intl.PluralRules(i18n.resolvedLanguage);

  const moveName = (move: StaggerMove) =>
    t(`detail.buildAdvisor.stagger.move.${move.key}`);

  /** "attack" / "attacks" — whatever plural form the language needs. */
  const attackUnit = (move: StaggerMove) =>
    t(`detail.buildAdvisor.stagger.attackUnit.${pluralRules.select(move.attacksToBreak)}`, {
      count: move.attacksToBreak,
      defaultValue: t("detail.buildAdvisor.stagger.attackUnit.other", {
        count: move.attacksToBreak,
      }),
    });

  /**
   * "light attacks" — the headline phrase.
   *
   * It gets its own string rather than composing "attacks" + the move name,
   * because that composition reads "10 attacks with Light attack": the same word
   * twice, which is exactly how it looked on the card. Only the plain swing ever
   * needs this; anything else falls back to attacksWith().
   */
  const lightAttacks = (move: StaggerMove) =>
    t(`detail.buildAdvisor.stagger.lightAttacks.${pluralRules.select(move.attacksToBreak)}`, {
      count: move.attacksToBreak,
      defaultValue: t("detail.buildAdvisor.stagger.lightAttacks.other", {
        count: move.attacksToBreak,
      }),
    });

  /**
   * "attacks with <move>", where the move arrives as `token` rather than as
   * text: the caller splits the finished sentence on it and renders the move in
   * its own colour. Word order stays the translator's to change — some languages
   * put the move first — which a hand-assembled row of spans could never allow.
   */
  const attacksWith = (move: StaggerMove, token: string) =>
    t(`detail.buildAdvisor.stagger.attacksWith.${pluralRules.select(move.attacksToBreak)}`, {
      count: move.attacksToBreak,
      move: token,
      defaultValue: t("detail.buildAdvisor.stagger.attacksWith.other", {
        count: move.attacksToBreak,
        move: token,
      }),
    });

  /** A multi-hit attack is worth spelling out — "112 stance / attack · 3 hits"
   *  is a different promise from the same number landing in one swing. */
  const damage = (move: StaggerMove) =>
    t(
      move.hitsPerAttack > 1
        ? "detail.buildAdvisor.stagger.damagePerAttack"
        : "detail.buildAdvisor.stagger.damagePerHit",
      { value: numberFormat.format(move.stanceDamage), hits: move.hitsPerAttack },
    );

  return { moveName, attackUnit, attacksWith, lightAttacks, damage };
};
