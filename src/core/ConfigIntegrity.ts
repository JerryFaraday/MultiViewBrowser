import type { Config } from "./model";
const unique = (ids: string[]) =>
  new Set(ids).size === ids.length && ids.every((id) => id.trim().length > 0);
export function assertIntegrity(c: Config) {
  const pages = [
    ...c.session.pages.filter((p) => p !== null),
    ...c.pageStash.flatMap((x) => (x.page ? [x.page] : [])),
  ];
  if (
    !unique(pages.map((p) => p.id)) ||
    !unique([
      ...c.session.pages.flatMap((p) => (p ? [p.id] : [])),
      ...c.pageStash.map((x) => x.id),
    ]) ||
    !unique(c.pageStash.map((x) => x.id)) ||
    c.pageStash.some((x) => x.page && x.id !== x.page.id) ||
    !unique(c.favorites.map((x) => x.id)) ||
    !unique(c.workspaces.map((x) => x.id)) ||
    !unique(c.layouts.map((x) => x.id)) ||
    !unique(c.groups) ||
    c.favorites.some((f) => !c.groups.includes(f.group)) ||
    (c.preferences.defaultWorkspace &&
      !c.workspaces.some((w) => w.id === c.preferences.defaultWorkspace))
  )
    throw Error("配置引用或ID不完整，请先恢复历史配置后重试。");
}
/** Deterministic, lossless repair for legacy data; duplicate copies with different state get new IDs. */
export function recoverIntegrity(c: Config): Config {
  const used = new Set<string>();
  const allocate = (id: string) => {
    let next = id.trim() || "recovered";
    let i = 1;
    while (used.has(next))
      next = (id.slice(0, 75) || "recovered") + "-recovered-" + i++;
    used.add(next);
    return next;
  };
  for (const item of c.pageStash) {
    item.id = allocate(item.id);
    if (item.page) item.page.id = item.id;
  }
  c.session.pages = c.session.pages.map((p) => {
    if (!p) return null;
    if (used.has(p.id)) {
      const parked = c.pageStash.find((x) => x.page?.id === p.id)?.page;
      if (parked && JSON.stringify(parked) === JSON.stringify(p)) return null;
    }
    p.id = allocate(p.id);
    return p;
  });
  for (const xs of [c.favorites, c.workspaces, c.layouts]) {
    used.clear();
    for (const x of xs) x.id = allocate(x.id);
  }
  c.groups = [...new Set(c.groups.filter((g) => g.trim()))];
  for (const f of c.favorites) {
    if (!f.group.trim()) f.group = "未分组";
    if (!c.groups.includes(f.group)) c.groups.push(f.group);
  }
  if (
    c.preferences.defaultWorkspace &&
    !c.workspaces.some((w) => w.id === c.preferences.defaultWorkspace)
  ) {
    c.preferences.defaultWorkspace = "";
  }
  return c;
}
