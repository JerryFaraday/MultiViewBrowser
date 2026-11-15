import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { defaults } from "../src/core/WorkspaceManager";
import { favoriteSchema } from "../src/core/model";
import {
  type LiveCache,
  mappingCheckInterval,
  mappingDue,
} from "../src/core/LiveStatus";
import { LiveMonitor, type LiveQuery } from "../electron/LiveMonitor";
import { LiveCacheWriter } from "../electron/LiveCacheWriter";
import { ConfigStore } from "../electron/storage";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
vi.mock("node:timers/promises", () => ({
  setTimeout: (
    ms: number,
    _value: unknown,
    { signal }: { signal: AbortSignal },
  ) =>
    new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(Error("cancelled"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, ms);
      signal.addEventListener("abort", abort, { once: true });
    }),
}));
const cache = (id = "35", time = Date.now()): LiveCache => ({
  formatVersion: 1,
  inputRoomId: id,
  realRoomId: "21622811",
  uid: "100",
  checkedAt: time,
});
function config(cached: LiveCache | null = null) {
  const c = defaults();
  c.bookmarksBar = true;
  c.preferences.liveDetection = true;
  c.favorites = [
    favoriteSchema.parse({
      id: "a",
      name: "fixture",
      group: "常用",
      url: "https://live.bilibili.com/35",
      roomId: "35",
      category: "bilibili-live",
      liveCache: cached,
      note: "",
      created: "",
    }),
  ];
  return c;
}
const primary: LiveQuery = async (kind, ids) =>
  kind === "rooms"
    ? {
        code: 0,
        data: Object.fromEntries(
          ids.map((id) => [
            "21622811",
            {
              roomid: 21622811,
              uid: 100,
              short_id: Number(id),
              live_status: 1,
            },
          ]),
        ),
      }
    : kind === "room"
      ? { code: 0, data: { uid: 100, room_id: 21622811, live_status: 1 } }
      : {
          code: 0,
          data: { "100": { uid: 100, room_id: 21622811, live_status: 1 } },
        };
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it("old/malformed cache remains loadable; changing room clears cache", () => {
  expect(config().favorites[0].liveCache).toBeNull();
  const f = config(cache()).favorites[0];
  expect(
    favoriteSchema.parse({ ...f, liveCache: { formatVersion: 9 } }).liveCache,
  ).toBeNull();
  expect(
    favoriteSchema.parse({
      ...f,
      roomId: "36",
      url: "https://live.bilibili.com/36",
    }).liveCache,
  ).toBeNull();
  expect(favoriteSchema.parse({ ...f, category: "web" }).liveCache).toBeNull();
  expect(favoriteSchema.parse({ ...f, id: "copy" }).liveCache).toEqual(
    f.liveCache,
  );
});
it("direct room API populates mapping and stays primary even with cache", async () => {
  const writes = vi.fn(),
    q = vi.fn(primary),
    m = new LiveMonitor(q, () => {}, 1000, writes);
  const c = config();
  m.configure(c);
  await vi.advanceTimersByTimeAsync(1);
  expect(q.mock.calls[0][0]).toBe("rooms");
  expect(m.states["35"].status).toBe("live");
  expect(writes.mock.calls[0][0][0].cache).toMatchObject({
    inputRoomId: "35",
    realRoomId: "21622811",
    uid: "100",
  });
  c.favorites[0].liveCache = writes.mock.calls[0][0][0].cache;
  m.configure(c);
  await vi.advanceTimersByTimeAsync(60000);
  expect(q.mock.calls.every((x) => x[0] === "rooms")).toBe(true);
  expect(writes).toHaveBeenCalledTimes(1);
  m.dispose();
});
it("restart uses persisted mapping for UID fallback without resolving again", async () => {
  const folder = mkdtempSync(join(tmpdir(), "mvb-cache-")),
    store = new ConfigStore(folder);
  store.save(config(cache()));
  const c = new ConfigStore(folder).load();
  const q = vi.fn<LiveQuery>(async (...args) =>
    args[0] === "rooms" ? { code: -412 } : primary(...args),
  );
  const m = new LiveMonitor(q, () => {});
  m.configure(c);
  await vi.advanceTimersByTimeAsync(1100);
  expect(q.mock.calls.map((x) => x[0])).toEqual(["rooms", "uids"]);
  expect(m.states["35"].status).toBe("live");
  m.dispose();
});
it("24h direct room evidence validates cache without extra requests", async () => {
  const writes = vi.fn(),
    q = vi.fn(primary),
    old = cache("35", Date.now() - mappingCheckInterval - 1),
    m = new LiveMonitor(q, () => {}, 1000, writes);
  m.configure(config(old));
  await vi.advanceTimersByTimeAsync(1);
  expect(q).toHaveBeenCalledTimes(1);
  expect(writes.mock.calls[0][0][0].cache.checkedAt).toBeGreaterThan(
    old.checkedAt,
  );
  m.dispose();
});
it("24h check boundary is exact and never expires the mapping", () => {
  const now = Date.now();
  expect(mappingDue(cache("35", now - mappingCheckInterval + 1), now)).toBe(
    false,
  );
  expect(mappingDue(cache("35", now - mappingCheckInterval), now)).toBe(true);
  expect(
    favoriteSchema.parse(config(cache("35", 1)).favorites[0]).liveCache?.uid,
  ).toBe("100");
});
it("explicit missing room revalidates once without deleting its mapping", async () => {
  const writes = vi.fn(),
    q = vi.fn<LiveQuery>(async () => ({ code: 60004 }));
  const m = new LiveMonitor(q, () => {}, 1000, writes);
  m.configure(config(cache()));
  await vi.advanceTimersByTimeAsync(2100);
  expect(q.mock.calls.map((x) => x[0])).toEqual(["rooms", "uids", "room"]);
  expect(m.states["35"].status).toBe("unknown");
  expect(writes).not.toHaveBeenCalled();
  m.dispose();
});
it("UID mismatch is repaired asynchronously using a reliable new mapping", async () => {
  const writes = vi.fn(),
    q: LiveQuery = async (kind) =>
      kind === "rooms"
        ? { code: -412 }
        : kind === "uids"
          ? {
              code: 0,
              data: { "100": { uid: 100, room_id: 999, live_status: 1 } },
            }
          : { code: 0, data: { uid: 200, room_id: 888, live_status: 0 } };
  const m = new LiveMonitor(q, () => {}, 1000, writes);
  m.configure(config(cache()));
  await vi.advanceTimersByTimeAsync(1100);
  expect(writes.mock.calls[0][0][0].cache).toMatchObject({
    uid: "200",
    realRoomId: "888",
  });
  expect(m.states["35"].status).toBe("offline");
  m.dispose();
});
it("disabled detection rejects late validation results and cache writes", async () => {
  let resolve!: (value: unknown) => void;
  const writes = vi.fn(),
    q: LiveQuery = async (...args) =>
      args[0] === "rooms"
        ? { code: -412 }
        : args[0] === "room"
          ? new Promise((r) => (resolve = r))
          : primary(...args);
  const m = new LiveMonitor(q, () => {}, 1000, writes),
    c = config(cache("35", 1));
  m.configure(c);
  await vi.advanceTimersByTimeAsync(1100);
  c.preferences.liveDetection = false;
  m.configure(c);
  resolve({ code: 0, data: { uid: 200, room_id: 888, live_status: 1 } });
  await vi.advanceTimersByTimeAsync(1);
  expect(writes).not.toHaveBeenCalled();
  expect(m.states).toEqual({});
  m.dispose();
});
it("stale fallback returns status before independent validation completes", async () => {
  let resolve!: (x: unknown) => void;
  const q = vi.fn<LiveQuery>(async (...args) =>
    args[0] === "rooms"
      ? { code: -412 }
      : args[0] === "room"
        ? new Promise((r) => (resolve = r))
        : primary(...args),
  );
  const writes = vi.fn(),
    m = new LiveMonitor(q, () => {}, 1000, writes);
  m.configure(config(cache("35", Date.now() - mappingCheckInterval - 1)));
  await vi.advanceTimersByTimeAsync(1100);
  expect(m.states["35"].status).toBe("live");
  expect(q.mock.calls.map((x) => x[0])).toEqual(["rooms", "uids", "room"]);
  await vi.advanceTimersByTimeAsync(61000);
  expect(q.mock.calls.filter((x) => x[0] === "rooms").length).toBe(2);
  resolve({ code: 0, data: { uid: 100, room_id: 21622811, live_status: 1 } });
  await vi.advanceTimersByTimeAsync(1);
  expect(writes).toHaveBeenCalledTimes(1);
  m.dispose();
});
it("temporary failures retain old cache and never write deletion", async () => {
  const writes = vi.fn(),
    old = cache("35", Date.now() - mappingCheckInterval - 1),
    q: LiveQuery = async () => {
      throw Error("network");
    },
    m = new LiveMonitor(q, () => {}, 1000, writes);
  m.configure(config(old));
  await vi.advanceTimersByTimeAsync(3000);
  expect(writes).not.toHaveBeenCalled();
  expect(m.states["35"].status).toBe("unknown");
  m.dispose();
});
it("reliable new direct identity replaces old mapping", async () => {
  const writes = vi.fn(),
    m = new LiveMonitor(
      async () => ({
        code: 0,
        data: {
          "999": { roomid: 999, short_id: 35, uid: 200, live_status: 0 },
        },
      }),
      () => {},
      1000,
      writes,
    );
  m.configure(config(cache()));
  await vi.advanceTimersByTimeAsync(1);
  expect(writes.mock.calls[0][0][0].cache).toMatchObject({
    realRoomId: "999",
    uid: "200",
  });
  expect(m.states["35"].status).toBe("offline");
  m.dispose();
});
it("duplicate aliases share one verification task", async () => {
  let checks = 0;
  const c = config(cache("35", Date.now() - mappingCheckInterval - 1));
  c.favorites.push({ ...c.favorites[0], id: "b" });
  const q: LiveQuery = async (...args) => {
    if (args[0] === "rooms") return { code: -412 };
    if (args[0] === "room") checks++;
    return primary(...args);
  };
  const m = new LiveMonitor(q, () => {});
  m.configure(c);
  await vi.advanceTimersByTimeAsync(1200);
  expect(checks).toBe(1);
  m.dispose();
});
it("coalesces patches and preserves concurrent edits, ordering and session", async () => {
  const path = mkdtempSync(join(tmpdir(), "mvb-cache-write-")),
    store = new ConfigStore(path);
  store.save(config());
  const save = vi.spyOn(store, "save"),
    w = new LiveCacheWriter(store, () => {});
  w.queue([{ favoriteId: "a", roomId: "35", cache: cache() }]);
  w.queue([{ favoriteId: "a", roomId: "35", cache: cache() }]);
  const latest = store.load();
  latest.favorites[0].name = "edited";
  store.save(latest);
  save.mockClear();
  await vi.advanceTimersByTimeAsync(500);
  expect(save).toHaveBeenCalledTimes(1);
  const saved = new ConfigStore(path).load();
  expect(saved.favorites[0].name).toBe("edited");
  expect(saved.favorites[0].liveCache?.uid).toBe("100");
  w.queue([
    { favoriteId: "a", roomId: "35", cache: saved.favorites[0].liveCache! },
  ]);
  await vi.advanceTimersByTimeAsync(500);
  expect(save).toHaveBeenCalledTimes(1);
  w.dispose();
});
it("queued patches cannot resurrect deleted favorite or overwrite changed room", async () => {
  for (const deleted of [true, false]) {
    const path = mkdtempSync(join(tmpdir(), "mvb-cache-write-")),
      store = new ConfigStore(path);
    store.save(config());
    const w = new LiveCacheWriter(store, () => {});
    w.queue([{ favoriteId: "a", roomId: "35", cache: cache() }]);
    const changed = store.load();
    if (deleted) changed.favorites = [];
    else
      changed.favorites[0] = {
        ...changed.favorites[0],
        roomId: "36",
        url: "https://live.bilibili.com/36",
      };
    store.save(changed);
    await vi.advanceTimersByTimeAsync(500);
    expect(store.load().favorites[0]?.liveCache ?? null).toBeNull();
    expect(store.load().favorites.length).toBe(deleted ? 0 : 1);
    w.dispose();
  }
});
it("stale renderer draft keeps its edits while accepting a concurrent cache patch", () => {
  const path = mkdtempSync(join(tmpdir(), "mvb-cache-merge-")),
    store = new ConfigStore(path);
  store.save(config());
  const draft = store.load();
  draft.favorites[0].note = "pending edit";
  const w = new LiveCacheWriter(store, () => {});
  w.queue([{ favoriteId: "a", roomId: "35", cache: cache() }]);
  w.flush();
  const merged = store.accept(draft);
  expect(merged.favorites[0].note).toBe("pending edit");
  expect(merged.favorites[0].liveCache?.uid).toBe("100");
  w.dispose();
});
it("failed writes retain the patch for a later retry; shutdown flushes it", () => {
  let current = config();
  const store = {
    load: () => structuredClone(current),
    save: vi.fn((next: typeof current) => {
      current = structuredClone(next);
    }),
  };
  const w = new LiveCacheWriter(store, () => {});
  store.save.mockImplementationOnce(() => {
    throw Error("disk");
  });
  w.queue([{ favoriteId: "a", roomId: "35", cache: cache() }]);
  w.flush();
  expect(current.favorites[0].liveCache).toBeNull();
  w.dispose();
  expect(current.favorites[0].liveCache?.uid).toBe("100");
  expect(store.save).toHaveBeenCalledTimes(2);
});
