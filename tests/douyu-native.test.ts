import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));
import { nativeDouyuQuery } from "../electron/live/DouyuNative";
let child: EventEmitter & {
  stdout: PassThrough;
  kill: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  vi.useFakeTimers();
  spawn.mockReset();
  child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    kill: vi.fn(),
  });
  spawn.mockReturnValue(child);
});
afterEach(() => vi.useRealTimers());
function respond(output: string, code = 0) {
  child.stdout.write(output);
  child.emit("close", code);
}
it("uses a fixed worker command and decodes fragmented UTF8 metadata/body", async () => {
  const p = nativeDouyuQuery("worker.exe")("123", new AbortController().signal);
  expect(spawn).toHaveBeenCalledWith(
    "worker.exe",
    ["douyu", "123"],
    expect.objectContaining({ shell: false, windowsHide: true }),
  );
  const text = Buffer.from(
    '{"httpStatus":200,"error":null}\n{"room":{"name":"测试","room_id":123,"show_status":1,"videoLoop":0}}',
  );
  for (const byte of text) child.stdout.write(Buffer.from([byte]));
  child.emit("close", 0);
  expect(await p).toMatchObject({
    httpStatus: 200,
    body: { room: { name: "测试", room_id: 123 } },
  });
});
it.each([429, 404, 503])(
  "preserves HTTP %s for adapter policy",
  async (status) => {
    const p = nativeDouyuQuery("worker.exe")(
      "123",
      new AbortController().signal,
    );
    respond(JSON.stringify({ httpStatus: status, error: null }) + "\n");
    expect(await p).toEqual({ httpStatus: status });
  },
);
it.each(["timeout", "network"])("preserves native %s", async (error) => {
  const p = nativeDouyuQuery("worker.exe")("123", new AbortController().signal);
  respond(JSON.stringify({ httpStatus: 0, error }) + "\n");
  expect(await p).toEqual({ httpStatus: 0, error });
});
it.each([
  "{}",
  '{"httpStatus":200,"error":null}\n<html>',
  '{"httpStatus":-1,"error":null}\n',
  '{"httpStatus":200,"error":"weird"}\n',
])(
  "rejects malformed protocol without interpreting offline",
  async (output) => {
    const p = nativeDouyuQuery("worker.exe")(
      "123",
      new AbortController().signal,
    );
    respond(output);
    expect(await p).toEqual({ httpStatus: 0, error: "parse" });
  },
);
it("bounds output and terminates the helper", async () => {
  const p = nativeDouyuQuery("worker.exe")("123", new AbortController().signal);
  child.stdout.write("x".repeat(1024 * 1024 + 257));
  expect(await p).toEqual({ httpStatus: 0, error: "parse" });
  expect(child.kill).toHaveBeenCalledTimes(1);
});
it("parent deadline kills a hung helper", async () => {
  const p = nativeDouyuQuery("worker.exe")("123", new AbortController().signal);
  await vi.advanceTimersByTimeAsync(14000);
  expect(await p).toEqual({ httpStatus: 0, error: "timeout" });
  expect(child.kill).toHaveBeenCalledTimes(1);
});
it("abort kills worker, rejects and ignores its later output", async () => {
  const c = new AbortController(),
    p = nativeDouyuQuery("worker.exe")("123", c.signal);
  const rejected = expect(p).rejects.toMatchObject({ name: "AbortError" });
  c.abort();
  await rejected;
  respond('{"httpStatus":200,"error":null}\n{}');
  expect(child.kill).toHaveBeenCalledTimes(1);
});
it("missing worker returns unavailable", async () => {
  const p = nativeDouyuQuery("worker.exe")("123", new AbortController().signal);
  child.emit("error", Error("missing"));
  expect(await p).toEqual({ httpStatus: 0, error: "unavailable" });
});
it("invalid room cannot reach the native command line", async () => {
  expect(
    await nativeDouyuQuery("worker.exe")(
      "123 & bad",
      new AbortController().signal,
    ),
  ).toEqual({ httpStatus: 0, error: "api" });
  expect(spawn).not.toHaveBeenCalled();
});
