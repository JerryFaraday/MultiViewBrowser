import { it, expect } from "vitest";
import { LiveDisplay } from "../electron/live/LiveDisplay";
import { defaults } from "../src/core/WorkspaceManager";
import { favoriteSchema } from "../src/core/model";
import { renameFavoriteGroup } from "../src/core/FavoritesManager";
import { sanitizeOperation } from "../src/core/OperationLog";
import { ConfigStore } from "../electron/storage";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
it("retains one failed round, repeated publications do not count as another round, second failure is unknown", () => {
  const d = new LiveDisplay(),
    keys = new Set(["douyu:35"]);
  d.accept("douyu:35", { status: "live" }, 1, 1000);
  expect(d.snapshot(keys, 2000)["douyu:35"].status).toBe("live");
  d.accept("douyu:35", { status: "unknown", reason: "network" }, 2, 2000);
  d.accept("douyu:35", { status: "unknown", reason: "network" }, 2, 2001);
  expect(d.snapshot(keys, 3000)["douyu:35"].status).toBe("live");
  d.accept("douyu:35", { status: "unknown", reason: "parse" }, 3, 4000);
  expect(d.snapshot(keys, 4000)["douyu:35"]).toEqual({
    status: "unknown",
    reason: "parse",
  });
  d.accept("douyu:35", { status: "offline" }, 4, 5000);
  expect(d.snapshot(keys, 5000)["douyu:35"].status).toBe("offline");
});
it("expires valid results even without a failure response; room changes cannot reuse old state", () => {
  const d = new LiveDisplay();
  d.validForMs = 120000;
  d.accept("35", { status: "live" }, 1, 1000);
  expect(d.nextExpiry(1001)).toBe(119999);
  expect(d.snapshot(new Set(["35"]), 121000)["35"]).toEqual({
    status: "unknown",
    reason: "stale",
  });
  d.retain(new Set(["36"]));
  expect(d.snapshot(new Set(["36"]), 121000)["36"].reason).toBe("pending");
});
it("both platforms show confirmed replay as red offline, not a request failure", () => {
  const d = new LiveDisplay();
  for (const key of ["35", "douyu:35"])
    d.accept(key, { status: "unknown", reason: "replay" }, 1, 1);
  expect(
    Object.values(d.snapshot(new Set(["35", "douyu:35"]), 2)).every(
      (s) => s.status === "offline" && s.reason === "replay",
    ),
  ).toBe(true);
});
it("unknown without a valid previous state is never offline", () => {
  const d = new LiveDisplay();
  d.accept("35", { status: "unknown", reason: "api" }, 1, 1);
  expect(d.snapshot(new Set(["35"]), 2)["35"].status).toBe("unknown");
});
it("rename preserves all memberships/order and rejects blank, duplicate, long names", () => {
  const c = defaults();
  c.groups = ["A", "B"];
  c.favorites = [
    favoriteSchema.parse({
      id: "a",
      name: "fixture",
      url: "https://example.com",
      group: "A",
      created: "",
      note: "legacy note",
    }),
  ];
  for (const name of [" ", "B", "a".repeat(101)])
    expect(() => renameFavoriteGroup(c, "A", name)).toThrow();
  renameFavoriteGroup(c, "A", " C ");
  expect(c.groups).toEqual(["C", "B"]);
  expect(c.favorites[0].group).toBe("C");
  expect(c.favorites[0].note).toBe("legacy note");
});
it("old config defaults grouping on and optional notes remain readable", () => {
  expect(defaults().preferences.showBookmarkGroups).toBe(true);
  expect(
    favoriteSchema.parse({
      id: "a",
      name: "n",
      url: "https://example.com",
      group: "A",
      created: "",
    }).note,
  ).toBe("");
});
it("hidden bar rejects changes to both dependent preferences at persistence boundary, restoring retains values", () => {
  const store = new ConfigStore(
      mkdtempSync(join(tmpdir(), "mvb-dependencies-")),
    ),
    c = defaults();
  c.bookmarksBar = false;
  c.preferences.showGroupNames = true;
  c.preferences.showBookmarkGroups = false;
  store.save(c);
  const draft = store.load();
  draft.preferences.showGroupNames = false;
  draft.preferences.showBookmarkGroups = true;
  const saved = store.accept(draft);
  expect(saved.preferences.showGroupNames).toBe(true);
  expect(saved.preferences.showBookmarkGroups).toBe(false);
  const enable = store.load();
  enable.bookmarksBar = true;
  store.accept(enable);
  expect(store.load().preferences.showGroupNames).toBe(true);
  expect(store.load().preferences.showBookmarkGroups).toBe(false);
});
it("diagnostics distinguish error categories and discard room identifiers and payloads", () => {
  for (const status of ["network", "api", "parse", "indeterminate"]) {
    const row = sanitizeOperation("live.detect_error", {
      action: "live.douyu",
      status,
      roomId: "123",
      url: "private",
      payload: {},
    });
    expect(row?.details).toEqual({ action: "live.douyu", status });
  }
});
