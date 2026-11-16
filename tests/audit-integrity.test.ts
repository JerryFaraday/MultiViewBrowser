import { it, expect } from "vitest";
import { mergeConfig } from "../src/core/ConfigMerge";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
import { ConfigStore, validateConfig } from "../electron/storage";
import { recoverIntegrity } from "../src/core/ConfigIntegrity";
import { parkPage, placeStashed } from "../src/core/PageStash";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
it("N01 merges different empty slots and follows a concurrent move", () => {
  const b = defaults();
  b.session.pages = [null, null];
  const d = structuredClone(b),
    l = structuredClone(b);
  d.session.pages[0] = newPage("https://a.example");
  l.session.pages[1] = newPage("https://b.example");
  expect(mergeConfig(b, d, l).session.pages).toEqual([
    d.session.pages[0],
    l.session.pages[1],
  ]);
  l.session.pages[0] = newPage("https://conflict.example");
  expect(() => mergeConfig(b, d, l)).toThrow("并发冲突");
});
it("N01 collections merge independent members and reject incompatible reorders", () => {
  const b = defaults();
  const make = (id: string) => ({
    id,
    name: id,
    tree: b.session.tree,
    created: "",
    modified: "",
  });
  b.layouts = [make("a"), make("b"), make("c")];
  const d = structuredClone(b),
    l = structuredClone(b);
  d.layouts.push(make("d"));
  l.layouts.unshift(make("e"));
  expect(mergeConfig(b, d, l).layouts.map((x) => x.id)).toEqual([
    "e",
    "a",
    "b",
    "c",
    "d",
  ]);
  d.layouts = [b.layouts[1], b.layouts[0], b.layouts[2]];
  l.layouts = [b.layouts[0], b.layouts[2], b.layouts[1]];
  expect(() => mergeConfig(b, d, l)).toThrow("并发冲突");
});
it("N01 deletion cannot be resurrected by reordering or stale edits", () => {
  const b = defaults();
  b.session.pages = [newPage("https://a.example")];
  const d = structuredClone(b),
    l = structuredClone(b);
  d.session.pages[0]!.title = "edit";
  l.session.pages[0] = null;
  expect(() => mergeConfig(b, d, l)).toThrow("并发冲突");
  expect(l.session.pages[0]).toBeNull();
});
for (const autoSave of [false, true])
  it(
    "N02 stash/restore survives restart with autoSave=" + autoSave,
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "mvb-integrity-")),
        store = new ConfigStore(dir, 350),
        c = defaults();
      c.session.pages = [newPage("https://a.example")];
      store.save(c);
      await store.flush();
      const d = store.load();
      d.preferences.autoSaveSession = autoSave;
      parkPage(d, d.session.pages[0]!.id);
      store.save(d);
      await store.flush();
      const restarted = new ConfigStore(dir, 350),
        parked = restarted.load();
      expect(parked.session.pages[0]).toBeNull();
      expect(parked.pageStash).toHaveLength(1);
      const id = placeStashed(parked, parked.pageStash[0].id);
      restarted.save(parked);
      await restarted.flush();
      const final = new ConfigStore(dir).load();
      expect(final.session.pages[0]?.id).toBe(id);
      expect(final.pageStash).toHaveLength(0);
    },
  );
it("N06 strict new writes reject duplicates; legacy recovery preserves distinct copies", () => {
  const c = defaults();
  const p = newPage("https://a.example");
  c.session.pages = [p];
  c.pageStash = [
    {
      id: p.id,
      url: p.url,
      title: p.title,
      page: { ...p, title: "different" },
    },
  ];
  expect(() => validateConfig(c)).toThrow();
  const recovered = recoverIntegrity(structuredClone(c));
  expect(() => validateConfig(recovered)).not.toThrow();
  expect(recovered.session.pages[0]?.id).not.toBe(p.id);
  expect(recovered.pageStash[0].page?.title).toBe("different");
  c.pageStash[0].page = { ...p };
  expect(recoverIntegrity(c).session.pages[0]).toBeNull();
});

it("N01 stash migration merges latest page properties without mutating inputs", () => {
  const b = defaults();
  b.session.pages = [newPage("https://a.example")];
  const d = structuredClone(b),
    l = structuredClone(b);
  parkPage(d, d.session.pages[0]!.id);
  l.session.pages[0]!.pageZoom = 2;
  const snapshot = JSON.stringify(l);
  const merged = mergeConfig(b, d, l);
  expect(merged.pageStash[0].page?.pageZoom).toBe(2);
  expect(merged.session.pages[0]).toBeNull();
  expect(JSON.stringify(l)).toBe(snapshot);
});

it("N01 member edits conflict with deletion, while independent workspace additions survive", () => {
  const b = defaults();
  const make = (id: string) => ({
    id,
    name: id,
    snapshot: structuredClone(b.session),
    created: "",
    modified: "",
  });
  b.workspaces = [make("a")];
  const d = structuredClone(b),
    l = structuredClone(b);
  d.workspaces.push(make("d"));
  l.workspaces.push(make("l"));
  expect(new Set(mergeConfig(b, d, l).workspaces.map((x) => x.id))).toEqual(
    new Set(["a", "d", "l"]),
  );
  d.workspaces[0].name = "edited";
  l.workspaces = [];
  expect(() => mergeConfig(b, d, l)).toThrow("并发冲突");
});
it("N06 legacy recovery is deterministic and strict writes reject orphan references", () => {
  const c = defaults();
  c.groups = ["常用", "常用"];
  c.favorites = [
    {
      id: "dup",
      name: "a",
      url: "https://a.example",
      category: "web",
      roomId: "",
      liveCache: null,
      group: "orphan",
      note: "",
      created: "",
    },
    {
      id: "dup",
      name: "b",
      url: "https://b.example",
      category: "web",
      roomId: "",
      liveCache: null,
      group: "orphan",
      note: "",
      created: "",
    },
  ];
  expect(() => validateConfig(c)).toThrow();
  const a = recoverIntegrity(structuredClone(c)),
    b = recoverIntegrity(structuredClone(c));
  expect(a).toEqual(b);
  expect(a.favorites).toHaveLength(2);
  expect(a.groups).toEqual(["常用", "orphan"]);
  expect(() => validateConfig(a)).not.toThrow();
});

it("N02 explicit restore protects a displaced frozen snapshot across subsequent saves", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mvb-frozen-swap-")),
    store = new ConfigStore(dir, 350),
    c = defaults();
  c.session.pages = [newPage("https://old.example")];
  store.save(c);
  await store.flush();
  const d = store.load();
  d.preferences.autoSaveSession = false;
  d.session.pages = [newPage("https://runtime.example")];
  const parked = newPage("https://restore.example");
  d.pageStash = [
    { id: parked.id, url: parked.url, title: parked.title, page: parked },
  ];
  store.save(d);
  await store.flush();
  const next = store.load();
  placeStashed(next, parked.id, 0);
  store.save(next);
  await store.flush();
  const later = store.load();
  later.masterVolume = 90;
  store.save(later);
  await store.flush();
  const restarted = new ConfigStore(dir).load();
  expect(restarted.session.pages[0]?.url).toContain("restore.example");
  expect(restarted.pageStash.some((x) => x.url.includes("old.example"))).toBe(
    true,
  );
  expect(
    restarted.pageStash.some((x) => x.url.includes("runtime.example")),
  ).toBe(true);
});

it("N06 reading repaired legacy data preserves the raw file and backs it up on save", async () => {
  const { writeFileSync, readFileSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "mvb-raw-recovery-")),
    store = new ConfigStore(dir),
    c = defaults();
  c.groups = ["常用", "常用"];
  const raw = JSON.stringify(c);
  writeFileSync(store.file, raw);
  const recovered = store.load();
  expect(recovered.groups).toEqual(["常用"]);
  expect(readFileSync(store.file, "utf8")).toBe(raw);
  recovered.masterVolume = 80;
  store.save(recovered);
  expect(readFileSync(store.file + ".bak", "utf8")).toBe(raw);
});
it("N06 irreparable files never silently become a fresh configuration", async () => {
  const { writeFileSync, readFileSync } = await import("node:fs");
  const store = new ConfigStore(
    mkdtempSync(join(tmpdir(), "mvb-corrupt-preserved-")),
  );
  writeFileSync(store.file, "broken");
  expect(() => store.load()).toThrow("原文件已保留");
  expect(readFileSync(store.file, "utf8")).toBe("broken");
});
