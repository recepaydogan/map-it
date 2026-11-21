import type { ReferenceTarget } from "../reference/reference-types";

/** The clicked reward takes precedence over quantities from other sources. */
export function getItemRewardQuantity(reward?: Pick<ReferenceTarget, "quantity" | "quantityMax" | "rewardRates">): number | string | undefined {
  if (reward?.rewardRates?.length) {
    const min = Math.min(...reward.rewardRates.map((rate) => rate.quantityMin));
    const max = Math.max(...reward.rewardRates.map((rate) => rate.quantityMax));
    return min === max ? min : `${min}–${max}`;
  }
  if (reward?.quantity !== undefined && reward.quantityMax !== undefined && reward.quantityMax > reward.quantity) {
    return `${reward.quantity}–${reward.quantityMax}`;
  }
  return reward?.quantity;
}
