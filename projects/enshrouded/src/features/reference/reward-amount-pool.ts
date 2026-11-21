import type { ReferenceRewardRate } from "./reference-types";

export const isSingleDrawAmountPool = (rates: ReferenceRewardRate[]): boolean => rates.length > 1
  && rates.every((rate) => rate.kind === "pool" && rate.poolCount === 1
    && rate.poolPercent === rates[0].poolPercent && rate.quantityMin === rate.quantityMax
    && rate.percent <= 100 && !rate.faction && rate.enhancementLevel === undefined
    && rate.contextKey === rates[0].contextKey && rate.levelMin === rates[0].levelMin && rate.levelMax === rates[0].levelMax
    && rate.poolPercent === 100)
  && Math.abs(rates.reduce((total, rate) => total + rate.percent, 0) - 100) < 0.001;
