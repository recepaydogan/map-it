/** Never keep a settled search filter after the input drops below three characters. */
export const getMapFilterQuery = (query: string, resultQuery: string): string =>
  query.trim().length >= 3 && resultQuery.trim().length >= 3 ? resultQuery : "";
