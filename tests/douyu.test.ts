import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  DouyuAdapter,
  parseDouyu,
  type DouyuTransport,
  type DouyuResponse,
} from "../electron/live/Douyu";
const body = (
  show_status: unknown = 1,
  videoLoop: unknown = 0,
  room_id: unknown = 123,
) => ({ room: { room_id, show_status, videoLoop } });
const ok = (id = "123"): DouyuResponse => ({
  httpStatus: 200,
  body: body(1, 0, id),
});
it.each([
  [1, 0, "LIVE"],
  [1, 1, "LOOP"],
  [0, 0, "OFFLINE"],
  [0, 1, "OFFLINE"],
  ["1", "0", "LIVE"],
  ["1", "1", "LOOP"],
  ["0", "0", "OFFLINE"],
  [2, 0, "OFFLINE"],
  [1, 2, "UNKNOWN"],
  [null, 0, "UNKNOWN"],
  [1, undefined, "UNKNOWN"],
  [true, 0, "UNKNOWN"],
])("parses status %s loop %s conservatively as %s", (show, loop, status) => {
  expect(
    parseDouyu("00123", {
      room: { room_id: 456, show_status: show, videoLoop: loop },
    }),
  ).toMatchObject({
    platform: "douyu",
    inputRoomId: "123",
    realRoomId: "456",
    status,
  });
});
it.each([
  {},
  null,
  [],
  { room: null },
  { room: [] },
  { room: {} },
  body(1, 0, "bad"),
  body(1, 0, Number.MAX_SAFE_INTEGER + 1),
])("invalid response stays unknown", (data) => {
  expect(parseDouyu("123", data)).toMatchObject({
    status: "UNKNOWN",
    reason: "parse",
  });
});
it.each([
  "",
  "0",
  "abc",
  "1/2",
  "https://douyu.com/123",
  "-1",
  "1.2",
  "1".repeat(21),
])("invalid input %s sends no request", async (id) => {
  const q = vi.fn<DouyuTransport>(async () => ok());
  expect(await new DouyuAdapter(q).query(id)).toMatchObject({
    status: "UNKNOWN",
    reason: "invalid-room",
  });
  expect(q).not.toHaveBeenCalled();
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it("deduplicates normalized room IDs in one round and does not cache across rounds", async () => {
  const q = vi.fn<DouyuTransport>(async (id) => ok(id)),
    m = new DouyuAdapter(q),
    seen = vi.fn();
  const result = m.queryMany(["123", "00123", "456"], { onResult: seen });
  await vi.advanceTimersByTimeAsync(300);
  expect((await result).map((r) => r.realRoomId)).toEqual([
    "123",
    "123",
    "456",
  ]);
  expect(q.mock.calls.map((c) => c[0])).toEqual(["123", "456"]);
  expect(seen).toHaveBeenCalledTimes(2);
  const next = m.query("123");
  await vi.advanceTimersByTimeAsync(300);
  await next;
  expect(q).toHaveBeenCalledTimes(3);
});
it("bounds concurrency and start spacing across simultaneous callers", async () => {
  let active = 0,
    maximum = 0;
  const starts: number[] = [];
  const q: DouyuTransport = async (id) => {
    active++;
    maximum = Math.max(maximum, active);
    starts.push(Date.now());
    await new Promise((r) => setTimeout(r, 1000));
    active--;
    return ok(id);
  };
  const m = new DouyuAdapter(q, { concurrency: 2, intervalMs: 100 });
  const a = m.queryMany(["1", "2", "3"]),
    b = m.queryMany(["4", "5"]);
  await vi.advanceTimersByTimeAsync(4000);
  await Promise.all([a, b]);
  expect(maximum).toBe(2);
  expect(starts.every((t, i) => !i || t - starts[i - 1] >= 100)).toBe(true);
});
it("a hanging room times out while other rooms publish immediately", async () => {
  const q: DouyuTransport = async (id) =>
      id === "1" ? new Promise(() => {}) : ok(id),
    seen = vi.fn();
  const m = new DouyuAdapter(q, {
    timeoutMs: 1000,
    retries: 0,
    intervalMs: 100,
  });
  const result = m.queryMany(["1", "2"], { onResult: seen });
  await vi.advanceTimersByTimeAsync(101);
  expect(seen.mock.calls[0][0]).toMatchObject({
    inputRoomId: "2",
    status: "LIVE",
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect((await result)[0]).toMatchObject({
    status: "UNKNOWN",
    reason: "timeout",
  });
});
it.each([429, 500, 502, 503, 504])(
  "retries transient HTTP %s with finite exponential backoff",
  async (code) => {
    const starts: number[] = [],
      q = vi.fn<DouyuTransport>(async () => {
        starts.push(Date.now());
        return { httpStatus: code };
      });
    const m = new DouyuAdapter(q, { intervalMs: 0 });
    const result = m.query("1");
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toMatchObject({
      status: "UNKNOWN",
      reason: "http",
      httpStatus: code,
    });
    expect(q).toHaveBeenCalledTimes(3);
    expect(starts[1] - starts[0]).toBe(500);
    expect(starts[2] - starts[1]).toBe(1000);
  },
);
it("network failure recovers and backoff does not occupy a concurrency slot", async () => {
  const starts: string[] = [];
  let failed = false;
  const q: DouyuTransport = async (id) => {
    starts.push(id);
    if (id === "1" && !failed) {
      failed = true;
      throw Error("network");
    }
    return ok(id);
  };
  const m = new DouyuAdapter(q, { concurrency: 1, intervalMs: 10 });
  const result = m.queryMany(["1", "2"]);
  await vi.advanceTimersByTimeAsync(1000);
  expect((await result).every((r) => r.status === "LIVE")).toBe(true);
  expect(starts).toEqual(["1", "2", "1"]);
});
it.each([403, 404, 400])(
  "HTTP %s including missing room stays unknown without retry",
  async (code) => {
    const q = vi.fn<DouyuTransport>(async () => ({ httpStatus: code }));
    const result = await new DouyuAdapter(q).query("123");
    expect(result).toMatchObject({ status: "UNKNOWN", reason: "http" });
    expect(q).toHaveBeenCalledTimes(1);
  },
);
it("malformed API has no retry, and no speculative backup state", async () => {
  const q = vi.fn<DouyuTransport>(async () => ({
    httpStatus: 200,
    body: { error: 1 },
  }));
  expect(await new DouyuAdapter(q).query("123")).toMatchObject({
    status: "UNKNOWN",
    reason: "api",
  });
  expect(q).toHaveBeenCalledTimes(1);
});
it("cancels active and queued requests and drops results from an ignoring transport", async () => {
  let resolve!: (r: DouyuResponse) => void;
  const q = vi.fn<DouyuTransport>(
      async () => new Promise((r) => (resolve = r)),
    ),
    seen = vi.fn(),
    c = new AbortController();
  const m = new DouyuAdapter(q, { concurrency: 1 });
  const result = m.queryMany(["1", "2", "3"], {
    signal: c.signal,
    onResult: seen,
  });
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(1);
  c.abort();
  await rejected;
  resolve(ok());
  await vi.advanceTimersByTimeAsync(2000);
  expect(q).toHaveBeenCalledTimes(1);
  expect(q.mock.calls[0][1].aborted).toBe(true);
  expect(seen).not.toHaveBeenCalled();
});
it("cancel during backoff prevents all remaining retries", async () => {
  const q = vi.fn<DouyuTransport>(async () => ({ httpStatus: 429 })),
    c = new AbortController();
  const result = new DouyuAdapter(q).query("1", { signal: c.signal });
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(1);
  c.abort();
  await rejected;
  await vi.advanceTimersByTimeAsync(3000);
  expect(q).toHaveBeenCalledTimes(1);
});
it("an already cancelled round starts nothing", async () => {
  const q = vi.fn<DouyuTransport>(async () => ok()),
    c = new AbortController();
  c.abort();
  await expect(
    new DouyuAdapter(q).queryMany(["1"], { signal: c.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(q).not.toHaveBeenCalled();
});
