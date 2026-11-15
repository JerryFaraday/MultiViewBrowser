import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  identifyLiveUrl,
  roomFromUrl,
  liveUrl,
  favoriteLiveUrl,
  liveKey,
} from "../src/core/LiveStatus";
import { favoriteSchema } from "../src/core/model";
import { defaults } from "../src/core/WorkspaceManager";
import { LiveCoordinator } from "../electron/live/LiveCoordinator";
import type { LiveQuery } from "../electron/LiveMonitor";
import type { DouyuTransport } from "../electron/live/Douyu";
vi.mock("node:timers/promises", () => ({
  setTimeout: (ms: number, _: unknown, { signal }: { signal: AbortSignal }) =>
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
it.each([
  ["http://www.douyu.com/00123/?x=1#test", "douyu-live", "123"],
  ["https://www.douyu.com/9999", "douyu-live", "9999"],
  ["https://douyu.com/35", "douyu-live", "35"],
  ["http://live.bilibili.com/35/?a=1", "bilibili-live", "35"],
])("identifies %s without confusing platforms", (url, category, id) => {
  expect(identifyLiveUrl(url)).toEqual({ category, roomId: id });
});
it.each([
  "https://www.douyu.com.evil.test/35",
  "https://evil.test/35",
  "https://www.douyu.com/abc",
  "https://www.douyu.com/35/more",
  "https://www.douyu.com/0",
  "https://www.douyu.com:444/35",
  (() => {
    const url = new URL("https://www.douyu.com/35");
    url.username = "fixture";
    url.password = "fixture";
    return url.href;
  })(),
  "https://www.douyu.com\\@evil.test/35",
  "ftp://www.douyu.com/35",
])("blocks invalid conversion %s", (url) =>
  expect(() => identifyLiveUrl(url)).toThrow(),
);
function favorite(category: "bilibili-live" | "douyu-live", id = "35") {
  return favoriteSchema.parse({
    id: category + id,
    category,
    roomId: id,
    url: liveUrl(id, category),
    name: "fixture",
    group: "常用",
    note: "",
    created: "",
  });
}
it("preserves previous full URLs only for the selected platform", () => {
  expect(
    favoriteLiveUrl("35", "http://www.douyu.com/35/?x=1", "douyu-live"),
  ).toBe("http://www.douyu.com/35/?x=1");
  expect(
    favoriteLiveUrl("35", "https://live.bilibili.com/35", "douyu-live"),
  ).toBe("https://www.douyu.com/35");
  expect(() => roomFromUrl("https://www.douyu.com/35")).toThrow();
});
it("legacy Bilibili favorites still load; Douyu validates URL/platform and persists", () => {
  const f = favorite("douyu-live");
  expect(favoriteSchema.parse(JSON.parse(JSON.stringify(f)))).toEqual(f);
  expect(favorite("bilibili-live").category).toBe("bilibili-live");
  expect(() =>
    favoriteSchema.parse({ ...f, url: "https://live.bilibili.com/35" }),
  ).toThrow();
  expect(liveKey(f)).not.toBe(liveKey(favorite("bilibili-live")));
});
const bili: LiveQuery = async () => ({
  code: 0,
  data: { "35": { roomid: 35, uid: 100, short_id: 0, live_status: 1 } },
});
const douyu: DouyuTransport = async (id) => ({
  httpStatus: 200,
  body: { room: { room_id: Number(id), show_status: 0, videoLoop: 0 } },
});
function config() {
  const c = defaults();
  c.bookmarksBar = true;
  c.preferences.liveDetection = true;
  c.favorites = [favorite("bilibili-live"), favorite("douyu-live")];
  return c;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it("runs both platforms immediately, deduplicates Douyu, keeps equal room numbers independent", async () => {
  const q = vi.fn(douyu),
    b = vi.fn(bili),
    m = new LiveCoordinator(b, q, () => {}),
    c = config();
  c.favorites.push({ ...c.favorites[1], id: "duplicate" });
  m.configure(c);
  await vi.advanceTimersByTimeAsync(1);
  expect(q).toHaveBeenCalledTimes(1);
  expect(b).toHaveBeenCalledTimes(1);
  expect(m.states["35"].status).toBe("live");
  expect(m.states["douyu:35"].status).toBe("offline");
  m.configure(c);
  await vi.advanceTimersByTimeAsync(60000);
  expect(q).toHaveBeenCalledTimes(2);
  m.dispose();
});
it("hiding bar cancels in-flight Douyu and drops late results; enabling starts immediately", async () => {
  let resolve!: (v: Awaited<ReturnType<DouyuTransport>>) => void;
  const q = vi.fn<DouyuTransport>(
      async () => new Promise((r) => (resolve = r)),
    ),
    m = new LiveCoordinator(bili, q, () => {}),
    c = config();
  m.configure(c);
  await vi.advanceTimersByTimeAsync(1);
  c.bookmarksBar = false;
  m.configure(c);
  expect(q.mock.calls[0][1].aborted).toBe(true);
  resolve(await douyu("35", new AbortController().signal));
  await vi.advanceTimersByTimeAsync(1);
  expect(m.states).toEqual({});
  c.bookmarksBar = true;
  m.configure(c);
  await vi.advanceTimersByTimeAsync(300);
  expect(q).toHaveBeenCalledTimes(2);
  m.dispose();
});
it("loop is grey replay and invalid response is unknown, interval changes and removal cancel old schedules", async () => {
  const q = vi.fn<DouyuTransport>(async (id) => ({
    httpStatus: 200,
    body: { room: { room_id: Number(id), show_status: 1, videoLoop: 1 } },
  }));
  const m = new LiveCoordinator(bili, q, () => {}),
    c = config();
  m.configure(c);
  await vi.advanceTimersByTimeAsync(1);
  expect(m.states["douyu:35"]).toEqual({ status: "unknown", reason: "replay" });
  c.preferences.liveInterval = 30;
  m.configure(c);
  await vi.advanceTimersByTimeAsync(300);
  expect(q).toHaveBeenCalledTimes(2);
  c.favorites = c.favorites.filter((f) => f.category !== "douyu-live");
  m.configure(c);
  await vi.advanceTimersByTimeAsync(61000);
  expect(q).toHaveBeenCalledTimes(2);
  expect(m.states["douyu:35"]).toBeUndefined();
  m.dispose();
});
