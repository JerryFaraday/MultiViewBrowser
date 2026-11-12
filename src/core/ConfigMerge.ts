import type { Config } from "./model";
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
/** Three-way reconciliation: independent edits survive; authoritative changes win conflicts. */
export function reconcile(base: unknown, draft: unknown, latest: unknown): any {
  if (equal(base, draft)) return latest;
  if (equal(base, latest)) return draft;
  if (Array.isArray(base) && Array.isArray(draft) && Array.isArray(latest)) {
    const keyed = [...base, ...draft, ...latest].every(
      (x) => x === null || (typeof x === "object" && typeof x.id === "string"),
    );
    if (!keyed) return latest;
    const ids = (xs: any[]) => xs.map((x) => x?.id ?? null);
    const order = equal(ids(base), ids(latest)) ? draft : latest;
    const pages = [...base, ...draft, ...latest].some((x) => x?.scale);
    const result = order.map((item) => {
      if (!item) return null;
      const before = base.find((x) => x?.id === item.id);
      const local = draft.find((x) => x?.id === item.id);
      const remote = latest.find((x) => x?.id === item.id);
      if (!before) return remote ?? local;
      if (!local || !remote) return null;
      return reconcile(before, local, remote);
    });
    return pages
      ? result
      : result.filter((x, i) => x !== null || order[i] === null);
  }
  if (
    base &&
    draft &&
    latest &&
    !Array.isArray(base) &&
    typeof base === "object" &&
    typeof draft === "object" &&
    typeof latest === "object"
  ) {
    return Object.fromEntries(
      Object.keys(latest).map((key) => [
        key,
        reconcile(
          (base as any)[key],
          (draft as any)[key],
          (latest as any)[key],
        ),
      ]),
    );
  }
  return latest;
}
export function mergeConfig(
  base: Config,
  draft: Config,
  latest: Config,
): Config {
  return reconcile(base, draft, latest);
}
