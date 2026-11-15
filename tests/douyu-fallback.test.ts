import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  DouyuAdapter,
  parseDouyuRoomApi,
  type DouyuTransport,
} from "../electron/live/Douyu";
const api = (room_status: unknown, error: unknown = 0) => ({
  error,
  data: { room_id: "6657", room_status },
});
it.each([0, "0", 2, "2"])("RoomApi confirmed status %s is offline", (s) => {
  expect(parseDouyuRoomApi("6657", api(s))).toMatchObject({
    status: "OFFLINE",
    realRoomId: "6657",
    source: "room-api",
  });
});
it.each([1, "1", 3, "3", true])(
  "RoomApi status %s cannot establish normal live",
  (s) => {
    expect(parseDouyuRoomApi("6657", api(s))).toMatchObject({
      status: "UNKNOWN",
      reason: "indeterminate",
    });
  },
);
it.each([
  null,
  "<html>房间已被关闭</html>",
  { error: 1, data: { room_id: "6657", room_status: 0 } },
  { error: 0, data: {} },
  { error: 0, data: { room_status: 0 } },
  { error: 0, data: { room_id: "6657", show_status: 0, videoLoop: 0 } },
])("backup errors/missing fields never become offline", (data) => {
  expect(parseDouyuRoomApi("6657", data).status).toBe("UNKNOWN");
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const good: DouyuTransport = async () => ({
  httpStatus: 200,
  body: { room: { room_id: 1667826, show_status: 1, videoLoop: 0 } },
});
const offline: DouyuTransport = async () => ({
  httpStatus: 200,
  body: api("0"),
});
it("6657 HTML parse failure falls back using its independent schema; duplicates share both requests", async () => {
  const p = vi.fn<DouyuTransport>(async () => ({
      httpStatus: 200,
      error: "parse",
    })),
    b = vi.fn(offline);
  const m = new DouyuAdapter(p, {}, b),
    result = m.queryMany(["6657", "006657"]);
  await vi.advanceTimersByTimeAsync(300);
  expect(
    (await result).every(
      (r) => r.status === "OFFLINE" && r.source === "room-api",
    ),
  ).toBe(true);
  expect(p).toHaveBeenCalledTimes(1);
  expect(b).toHaveBeenCalledTimes(1);
});
it("1667826 valid betard JSON stays primary and skips backup", async () => {
  const b = vi.fn(offline),
    m = new DouyuAdapter(good, {}, b);
  expect(await m.query("1667826")).toMatchObject({
    status: "LIVE",
    source: "betard",
  });
  expect(b).not.toHaveBeenCalled();
});
it("valid primary replay does not let backup live status override it", async () => {
  const b = vi.fn(offline),
    m = new DouyuAdapter(
      async () => ({
        httpStatus: 200,
        body: { room: { room_id: 6657, show_status: 1, videoLoop: 1 } },
      }),
      {},
      b,
    );
  expect((await m.query("6657")).status).toBe("LOOP");
  expect(b).not.toHaveBeenCalled();
});
it("backup live without reliable replay flag remains unknown even if unverified extra fields exist", async () => {
  const m = new DouyuAdapter(
    async () => ({ httpStatus: 200, body: "<html>closed</html>" }),
    {},
    async () => ({ httpStatus: 200, body: { ...api("1"), videoLoop: 0 } }),
  );
  const result = m.query("6657");
  await vi.advanceTimersByTimeAsync(300);
  expect(await result).toMatchObject({
    status: "UNKNOWN",
    reason: "indeterminate",
    source: "room-api",
  });
});
it.each(["http", "network", "parse"])(
  "backup %s failure remains unknown and retries finitely",
  async (kind) => {
    const p = vi.fn<DouyuTransport>(async () => ({
      httpStatus: 200,
      error: "parse",
    }));
    const b = vi.fn<DouyuTransport>(async () =>
      kind === "http"
        ? { httpStatus: 503 }
        : { httpStatus: 0, error: kind as "network" | "parse" },
    );
    const m = new DouyuAdapter(p, {}, b),
      result = m.query("6657");
    await vi.advanceTimersByTimeAsync(3000);
    expect(await result).toMatchObject({
      status: "UNKNOWN",
      source: "room-api",
    });
    expect(b).toHaveBeenCalledTimes(kind === "parse" ? 1 : 3);
  },
);
it("cancel before backup starts prevents it and publishes no stale result", async () => {
  const c = new AbortController(),
    b = vi.fn(offline),
    seen = vi.fn();
  const m = new DouyuAdapter(
      async () => ({ httpStatus: 200, error: "parse" }),
      {},
      b,
    ),
    result = m.query("6657", { signal: c.signal, onResult: seen });
  const cancelled = expect(result).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.advanceTimersByTimeAsync(1);
  c.abort();
  await cancelled;
  await vi.advanceTimersByTimeAsync(1000);
  expect(b).not.toHaveBeenCalled();
  expect(seen).not.toHaveBeenCalled();
});
it("cancels an in-flight backup and ignores its late answer", async () => {
  let resolve!: (v: Awaited<ReturnType<DouyuTransport>>) => void;
  const b = vi.fn<DouyuTransport>(
      async () => new Promise((r) => (resolve = r)),
    ),
    c = new AbortController(),
    seen = vi.fn();
  const m = new DouyuAdapter(
    async () => ({ httpStatus: 200, error: "parse" }),
    {},
    b,
  );
  const result = m.query("6657", { signal: c.signal, onResult: seen }),
    cancelled = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(300);
  c.abort();
  await cancelled;
  expect(b.mock.calls[0][1].aborted).toBe(true);
  resolve({ httpStatus: 200, body: api("0") });
  await vi.advanceTimersByTimeAsync(1);
  expect(seen).not.toHaveBeenCalled();
});
