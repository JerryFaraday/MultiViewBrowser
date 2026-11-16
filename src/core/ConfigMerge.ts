import type { Config, Page } from "./model";
type Value =
  | null
  | boolean
  | number
  | string
  | undefined
  | Value[]
  | { [key: string]: Value };
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export class ConfigConflict extends Error {
  constructor() {
    super("配置存在并发冲突，未覆盖任何修改；请保留草稿并重试或取消操作。");
  }
}
const record = (v: Value): v is { [key: string]: Value } =>
  !!v && typeof v === "object" && !Array.isArray(v);
function orderedIds(
  base: string[],
  draft: string[],
  latest: string[],
  members: Set<string>,
) {
  const edges = new Map<string, Set<string>>(),
    degree = new Map<string, number>();
  for (const id of members) {
    edges.set(id, new Set());
    degree.set(id, 0);
  }
  const original = new Set(base);
  for (const branch of [draft, latest]) {
    const present = new Set(branch);
    const common = base.filter((id) => members.has(id) && present.has(id));
    const commonSet = new Set(common);
    const reordered = !same(
      common,
      branch.filter((id) => commonSet.has(id)),
    );
    const kept = branch.filter((id) => members.has(id));
    for (let i = 1; i < kept.length; i++)
      if (reordered || !original.has(kept[i]) || !original.has(kept[i - 1])) {
        const from = kept[i - 1],
          to = kept[i];
        if (!edges.get(from)!.has(to)) {
          edges.get(from)!.add(to);
          degree.set(to, degree.get(to)! + 1);
        }
      }
  }
  const priority = [...new Set([...latest, ...draft])].filter((id) =>
    members.has(id),
  );
  const rank = new Map(priority.map((id, i) => [id, i]));
  const heap: string[] = [];
  const push = (id: string) => {
    heap.push(id);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (rank.get(heap[p])! <= rank.get(heap[i])!) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  for (const id of priority) if (degree.get(id) === 0) push(id);
  const result: string[] = [];
  while (heap.length) {
    const next = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      while (true) {
        let c = i * 2 + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && rank.get(heap[c + 1])! < rank.get(heap[c])!)
          c++;
        if (rank.get(heap[i])! <= rank.get(heap[c])!) break;
        [heap[i], heap[c]] = [heap[c], heap[i]];
        i = c;
      }
    }
    result.push(next);
    for (const to of edges.get(next)!) {
      degree.set(to, degree.get(to)! - 1);
      if (degree.get(to) === 0) push(to);
    }
  }
  if (result.length !== members.size) throw new ConfigConflict();
  return result;
}
function mergePages(
  base: (Page | null)[],
  draft: (Page | null)[],
  latest: (Page | null)[],
  ownershipChecked = false,
) {
  const maps = [base, draft, latest].map(
    (xs) =>
      new Map(
        xs.flatMap((p, i) =>
          p ? [[p.id, { page: p, slot: i }] as const] : [],
        ),
      ),
  );
  const result: (Page | null)[] = Array(
    Math.max(base.length, draft.length, latest.length),
  ).fill(null);
  for (const id of new Set(maps.flatMap((m) => [...m.keys()]))) {
    const [b, d, l] = maps.map((m) => m.get(id));
    if (b && (!d || !l)) {
      const survivor = d ?? l;
      if (!ownershipChecked && survivor && !same(survivor.page, b.page))
        throw new ConfigConflict();
      continue;
    } // Unchanged copies cannot resurrect a deletion.
    if (!d && !l) continue;
    const slot = !b
      ? (d?.slot ?? l!.slot)
      : d!.slot === b.slot
        ? l!.slot
        : l!.slot === b.slot || d!.slot === l!.slot
          ? d!.slot
          : -1;
    if (slot < 0 || result[slot] || (!b && d && l && d.slot !== l.slot))
      throw new ConfigConflict();
    result[slot] = mergeValue(
      b?.page as unknown as Value,
      d?.page as unknown as Value,
      l?.page as unknown as Value,
      "page",
    ) as unknown as Page;
  }
  return result;
}
function mergeValue(
  base: Value,
  draft: Value,
  latest: Value,
  path: string,
): Value {
  if (same(draft, latest) || same(base, draft)) return latest;
  if (same(base, latest)) return draft;
  if (path.endsWith(".pages"))
    return mergePages(
      base as unknown as (Page | null)[],
      draft as unknown as (Page | null)[],
      latest as unknown as (Page | null)[],
      path === "session.pages",
    ) as unknown as Value;
  if (Array.isArray(base) && Array.isArray(draft) && Array.isArray(latest)) {
    if (
      ![
        "favorites",
        "workspaces",
        "layouts",
        "pageStash",
        "preferences.permissions",
      ].includes(path)
    )
      throw new ConfigConflict();
    const key = path === "preferences.permissions" ? "origin" : "id";
    const maps = [base, draft, latest].map(
      (xs) =>
        new Map(
          xs.map((x) => [String((x as { [key: string]: Value })[key]), x]),
        ),
    );
    const values = new Map<string, Value>();
    for (const id of new Set(maps.flatMap((m) => [...m.keys()]))) {
      const [b, d, l] = maps.map((m) => m.get(id));
      if (b !== undefined && (d === undefined || l === undefined)) {
        const survivor = d ?? l;
        if (
          path !== "pageStash" &&
          survivor !== undefined &&
          !same(survivor, b)
        )
          throw new ConfigConflict();
        continue;
      }
      values.set(id, mergeValue(b, d, l, path + ".item"));
    }
    return orderedIds(
      [...maps[0].keys()],
      [...maps[1].keys()],
      [...maps[2].keys()],
      new Set(values.keys()),
    ).map((id) => values.get(id)!);
  }
  if (record(base) && record(draft) && record(latest))
    return Object.fromEntries(
      [
        ...new Set([
          ...Object.keys(base),
          ...Object.keys(draft),
          ...Object.keys(latest),
        ]),
      ].map((key) => [
        key,
        mergeValue(
          base[key],
          draft[key],
          latest[key],
          path ? path + "." + key : key,
        ),
      ]),
    );
  throw new ConfigConflict();
}
export function mergeConfig(
  base: Config,
  draft: Config,
  latest: Config,
): Config {
  const pageMaps = [base, draft, latest].map(
    (c) =>
      new Map([
        ...c.session.pages.flatMap((p, i) =>
          p ? [[p.id, { page: p, owner: "slot:" + i }] as const] : [],
        ),
        ...c.pageStash.flatMap((x) =>
          x.page
            ? [[x.page.id, { page: x.page, owner: "stash:" + x.id }] as const]
            : [],
        ),
      ]),
  );
  for (const [id, b] of pageMaps[0]) {
    const d = pageMaps[1].get(id),
      l = pageMaps[2].get(id);
    if (
      (!d && l && !same(b.page, l.page)) ||
      (!l && d && !same(b.page, d.page))
    )
      throw new ConfigConflict();
    if (
      d &&
      l &&
      d.owner !== b.owner &&
      l.owner !== b.owner &&
      d.owner !== l.owner
    )
      throw new ConfigConflict();
  }
  const value = structuredClone(
    mergeValue(
      { ...base, revision: 0 } as unknown as Value,
      { ...draft, revision: 0 } as unknown as Value,
      { ...latest, revision: 0 } as unknown as Value,
      "",
    ) as unknown as Config,
  );
  const mergePage = (page: Page) => {
    const [b, d, l] = pageMaps.map((m) => m.get(page.id)?.page);
    return mergeValue(
      b as unknown as Value,
      d as unknown as Value,
      l as unknown as Value,
      "page",
    ) as unknown as Page;
  };
  const deleted = (id: string) =>
    pageMaps[0].has(id) && (!pageMaps[1].has(id) || !pageMaps[2].has(id));
  value.session.pages = value.session.pages.map((p) =>
    p && !deleted(p.id) ? mergePage(p) : null,
  );
  value.pageStash = value.pageStash.filter(
    (x) => !x.page || !deleted(x.page.id),
  );
  for (const x of value.pageStash)
    if (x.page) {
      x.page = mergePage(x.page);
      x.url = x.page.url;
      x.title = x.page.title;
    }
  return { ...value, revision: latest.revision };
}
