export const formatDropChance = (percent: number, language: string) => percent > 0 && percent < 0.1
  ? `<${(0.1).toLocaleString(language)}%`
  : `${percent.toLocaleString(language, { maximumFractionDigits: 1 })}%`;
