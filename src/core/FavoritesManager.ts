import type { Config } from "./model";
export function searchFavorites(items: Config["favorites"], query: string) {
  const q = query.toLowerCase();
  return items.filter((f) =>
    `${f.name} ${f.url} ${f.group} ${f.note}`.toLowerCase().includes(q),
  );
}
export function moveItem<T>(
  items: T[],
  from: number,
  to: number,
  after = false,
) {
  if (from < 0 || to < 0 || from === to) return items;
  const result = [...items],
    value = result.splice(from, 1)[0];
  result.splice(to - (from < to ? 1 : 0) + (after ? 1 : 0), 0, value);
  return result;
}
export function moveFavorite(
  items: Config["favorites"],
  id: string,
  group: string,
  targetId?: string,
  after = false,
) {
  const index = items.findIndex((f) => f.id === id);
  if (index < 0 || id === targetId) return items;
  const value = { ...items[index], group },
    result = items.filter((f) => f.id !== id);
  const target = targetId ? result.findIndex((f) => f.id === targetId) : -1;
  const last = result.reduce(
    (last, f, i) => (f.group === group ? i : last),
    -1,
  );
  result.splice(
    target >= 0
      ? target + (after ? 1 : 0)
      : last >= 0
        ? last + 1
        : result.length,
    0,
    value,
  );
  return result;
}
