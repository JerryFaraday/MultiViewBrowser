import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { roomId, roomFromUrl, apiState, liveUrl } from "../src/core/LiveStatus";
import { configSchema, favoriteSchema } from "../src/core/model";
import { defaults } from "../src/core/WorkspaceManager";
import { ConfigStore } from "../electron/storage";
import {
  LiveMonitor,
  nativeLiveQuery,
  type LiveQuery,
} from "../electron/LiveMonitor";
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
const favorite = (id: string, room = "35") =>
  favoriteSchema.parse({
    id,
    name: "fixture",
    url: liveUrl(room),
    category: "bilibili-live",
    roomId: room,
    group: "常用",
    note: "",
    created: "",
  });
function config() {
  const c = defaults();
  c.bookmarksBar = true;
  c.preferences.liveDetection = true;
  c.favorites = [favorite("a"), favorite("b")];
  return c;
}
const reply: LiveQuery = async (kind, ids) =>
  kind === "rooms"
    ? {
        code: 0,
        data: Object.fromEntries(
          ids.map((id) => [
            id,
            { roomid: Number(id), short_id: 0, uid: 100, live_status: 1 },
          ]),
        ),
      }
    : kind === "room"
      ? { code: 0, data: { uid: 100, room_id: 35 } }
      : {
          code: 0,
          data: Object.fromEntries(
            ids.map((uid) => [
              uid,
              { uid: Number(uid), room_id: 35, live_status: 1 },
            ]),
          ),
        };
const processes = vi.hoisted(() => ({ children: [] as any[] }));
vi.mock("node:child_process", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    spawn: () => {
      const child: any = new EventEmitter();
      child.stdout = new EventEmitter();
      child.kill = vi.fn();
      processes.children.push(child);
      return child;
    },
  };
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it.each([
  "https://live.bilibili.com/35",
  "http://live.bilibili.com/35/",
  "https://live.bilibili.com/35?foo=bar",
])("extracts a valid room URL %s", (url) =>
  expect(roomFromUrl(url)).toBe("35"),
);
it.each([
  "https://bilibili.com/35",
  "https://live.bilibili.com.evil.test/35",
  "https://live.bilibili.com/abc",
  "https://live.bilibili.com/35/other",
  "https://evil@live.bilibili.com/35",
  "https://live.bilibili.com/",
  "https://live.bilibili.com/0",
])("rejects invalid URL %s", (url) => expect(() => roomFromUrl(url)).toThrow());
it.each(["0", "-1", "1.5", "35a", " 35", "1e3"])(
  "rejects invalid room %s",
  (x) => expect(() => roomId(x)).toThrow(),
);
it("normalizes room IDs and distinguishes replay/unknown from offline", () => {
  expect(roomId("00035")).toBe("35");
  expect(apiState(1).status).toBe("live");
  expect(apiState(0).status).toBe("offline");
  expect(apiState(2)).toEqual({ status: "unknown", reason: "replay" });
  expect(apiState(undefined).status).toBe("unknown");
});
it("migrates old favorites, enforces room/url consistency and bookmark dependency", () => {
  const c = config();
  const raw: any = {
    ...c,
    favorites: [
      {
        id: "old",
        name: "old",
        url: "https://example.com",
        group: "常用",
        note: "",
        created: "",
      },
    ],
  };
  expect(configSchema.parse(raw).favorites[0].category).toBe("web");
  c.bookmarksBar = false;
  expect(configSchema.parse(c).preferences.liveDetection).toBe(false);
  expect(() =>
    favoriteSchema.parse({ ...favorite("a"), roomId: "36" }),
  ).toThrow();
});
it.each([30, 60, 1800])(
  "persists interval %i and live metadata through real store restart",
  (interval) => {
    const c = config();
    c.preferences.liveInterval = interval;
    const path = mkdtempSync(join(tmpdir(), "mvb-live-"));
    new ConfigStore(path).save(c);
    const saved = new ConfigStore(path).load();
    expect(saved.preferences.liveInterval).toBe(interval);
    expect(saved.preferences.liveDetection).toBe(true);
    expect(saved.favorites[0]).toEqual(c.favorites[0]);
  },
);
it.each([29, 1801, 30.5])("rejects interval %i", (value) => {
  const c = config();
  c.preferences.liveInterval = value;
  expect(() => configSchema.parse(c)).toThrow();
});
it("deduplicates rooms and keeps direct room batches as the primary path", async () => {
  const q = vi.fn(reply),
    monitor = new LiveMonitor(q, () => {});
  monitor.configure(config());
  await vi.advanceTimersByTimeAsync(1100);
  expect(q.mock.calls.map((c) => c.slice(0, 2))).toEqual([["rooms", ["35"]]]);
  expect(monitor.states["35"].status).toBe("live");
  await vi.advanceTimersByTimeAsync(60000);
  expect(q.mock.calls.filter((c) => c[0] === "room")).toHaveLength(0);
  expect(q.mock.calls.filter((c) => c[0] === "rooms")).toHaveLength(2);
  monitor.dispose();
});
it("disabled or hidden bookmarks never query, stopping clears indicators and queued work", async () => {
  const q = vi.fn(reply),
    monitor = new LiveMonitor(q, () => {}),
    c = config();
  c.preferences.liveDetection = false;
  monitor.configure(c);
  await vi.advanceTimersByTimeAsync(2000);
  expect(q).not.toHaveBeenCalled();
  c.preferences.liveDetection = true;
  monitor.configure(c);
  await vi.advanceTimersByTimeAsync(1100);
  c.bookmarksBar = false;
  monitor.configure(c);
  const count = q.mock.calls.length;
  await vi.advanceTimersByTimeAsync(1800000);
  expect(q).toHaveBeenCalledTimes(count);
  expect(monitor.states).toEqual({});
  monitor.dispose();
});
it("late result after removal or dispose cannot publish stale status", async () => {
  let resolve!: (x: unknown) => void;
  const q: LiveQuery = () => new Promise((r) => (resolve = r)),
    publish = vi.fn(),
    monitor = new LiveMonitor(q, publish),
    c = config();
  monitor.configure(c);
  await vi.advanceTimersByTimeAsync(1);
  c.favorites = [];
  monitor.configure(c);
  resolve({ code: 0, data: { uid: 100, room_id: 35 } });
  await vi.advanceTimersByTimeAsync(2000);
  expect(monitor.states).toEqual({});
  const count = publish.mock.calls.length;
  monitor.dispose();
  await vi.advanceTimersByTimeAsync(1800000);
  expect(publish).toHaveBeenCalledTimes(count);
});
it("network failure is unknown and next cycle recovers without false offline", async () => {
  let failed = true;
  const q: LiveQuery = async (...args) => {
    if (failed) throw Error("network");
    return reply(...args);
  };
  const monitor = new LiveMonitor(q, () => {});
  monitor.configure(config());
  await vi.advanceTimersByTimeAsync(1100);
  expect(monitor.states["35"]).toEqual({
    status: "unknown",
    reason: "network",
  });
  failed = false;
  await vi.advanceTimersByTimeAsync(62000);
  expect(monitor.states["35"].status).toBe("live");
  monitor.dispose();
});
it("malformed batch is unknown, not offline", async () => {
  const monitor = new LiveMonitor(
    async (...args) =>
      args[0] === "room" ? reply(...args) : { code: 0, data: {} },
    () => {},
  );
  monitor.configure(config());
  await vi.advanceTimersByTimeAsync(2100);
  expect(monitor.states["35"]).toEqual({
    status: "unknown",
    reason: "indeterminate",
  });
  monitor.dispose();
});
it("interval changes cancel old timer and apply 30 second cadence", async () => {
  const q = vi.fn(reply),
    monitor = new LiveMonitor(q, () => {}),
    c = config();
  monitor.configure(c);
  await vi.advanceTimersByTimeAsync(1100);
  c.preferences.liveInterval = 30;
  monitor.configure(c);
  await vi.advanceTimersByTimeAsync(1100);
  const count = q.mock.calls.length;
  await vi.advanceTimersByTimeAsync(31000);
  expect(q.mock.calls.length).toBe(count + 1);
  monitor.dispose();
});

it("canonical aliases share one UID batch", async () => {
  const c = config();
  c.favorites = [favorite("a", "35"), favorite("b", "36")];
  const q = vi.fn<LiveQuery>(async (...args) =>
      args[0] === "rooms" ? { code: -1 } : reply(...args),
    ),
    m = new LiveMonitor(q, () => {});
  m.configure(c);
  await vi.advanceTimersByTimeAsync(3100);
  expect(q.mock.calls.filter((x) => x[0] === "uids").map((x) => x[1])).toEqual([
    ["100"],
  ]);
  m.dispose();
});

it("native transport times out and kills a hung worker", async () => {
  const c = new AbortController();
  const p = nativeLiveQuery("fixture.exe")("room", ["35"], c.signal);
  const checked = expect(p).rejects.toThrow("network");
  await vi.advanceTimersByTimeAsync(14000);
  await checked;
  expect(processes.children.at(-1).kill).toHaveBeenCalledTimes(1);
});
it("native transport cancels an in-flight worker", async () => {
  const c = new AbortController();
  const p = nativeLiveQuery("fixture.exe")("room", ["35"], c.signal);
  const checked = expect(p).rejects.toThrow("cancelled");
  c.abort();
  await checked;
  expect(processes.children.at(-1).kill).toHaveBeenCalledTimes(1);
});
it("native transport reports missing binary as unknown/unavailable", async () => {
  const c = new AbortController();
  const p = nativeLiveQuery("missing.exe")("room", ["35"], c.signal);
  const checked = expect(p).rejects.toThrow("unavailable");
  processes.children.at(-1).emit("error", Error("fixture"));
  await checked;
});
it("splits many unique UIDs into bounded batches", async () => {
  const c = config();
  c.favorites = Array.from({ length: 51 }, (_, i) =>
    favorite(String(i), String(i + 1)),
  );
  const q = vi.fn<LiveQuery>(async (kind, ids) =>
    kind === "rooms"
      ? {
          code: 0,
          data: Object.fromEntries(
            ids.map((id) => [
              id,
              {
                roomid: Number(id),
                uid: Number(id),
                short_id: 0,
                live_status: 0,
              },
            ]),
          ),
        }
      : kind === "room"
        ? { code: 0, data: { uid: Number(ids[0]), room_id: Number(ids[0]) } }
        : {
            code: 0,
            data: Object.fromEntries(
              ids.map((uid) => [
                uid,
                { uid: Number(uid), room_id: Number(uid), live_status: 0 },
              ]),
            ),
          },
  );
  const m = new LiveMonitor(q, () => {});
  m.configure(c);
  await vi.advanceTimersByTimeAsync(54000);
  expect(
    q.mock.calls.filter((x) => x[0] === "rooms").map((x) => x[1].length),
  ).toEqual([50, 1]);
  expect(Object.values(m.states).every((x) => x.status === "offline")).toBe(
    true,
  );
  m.dispose();
});
