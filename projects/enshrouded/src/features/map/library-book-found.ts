import type { MapPoint } from "./types";

const bookIdOf = (point: MapPoint): string | undefined => "bookId" in point ? point.bookId : undefined;

/** All pickup pins of one book share the existing Found state. */
export const completeBookLocationIds = (points: MapPoint[], completedIds: string[]): string[] => {
  const completed = new Set(completedIds);
  const completedBooks = new Set(points.filter((point) => completed.has(point.id))
    .map(bookIdOf).filter((id): id is string => !!id));
  for (const point of points) {
    if (completedBooks.has(bookIdOf(point) ?? "")) completed.add(point.id);
  }
  return [...completed];
};

export const bookLocationGroup = (points: MapPoint[], pointId: string): string[] => {
  const point = points.find((entry) => entry.id === pointId);
  const bookId = point && bookIdOf(point);
  return bookId ? points.filter((entry) => bookIdOf(entry) === bookId).map((entry) => entry.id) : [pointId];
};
