export const localizedKnowledgeValue = <T>(values: Readonly<Record<string, T>>, locale: string): T =>
  values[locale] ?? values[locale.split("-")[0]] ?? values.en ?? Object.values(values)[0];
