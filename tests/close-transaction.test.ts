import { it, expect, vi } from "vitest";
import { CloseTransaction } from "../electron/CloseTransaction";
it("N05 acceptance failure never persists; cancel allows a subsequent normal close", async () => {
  let fail = true;
  const requestDraft = vi.fn(),
    persist = vi.fn(async () => true),
    finish = vi.fn();
  const flow = new CloseTransaction({
    requestDraft,
    accept: () => {
      if (fail) throw Error("revision");
    },
    persist,
    failure: () => "cancel",
    finish,
  });
  flow.request();
  await flow.submit({});
  expect(persist).not.toHaveBeenCalled();
  expect(finish).not.toHaveBeenCalled();
  expect(flow.phase).toBe("idle");
  fail = false;
  flow.request();
  await flow.submit({});
  expect(finish).toHaveBeenCalledOnce();
});
it("N05 disk retry is bounded and does not resubmit the accepted draft", async () => {
  const accept = vi.fn(),
    finish = vi.fn();
  let failures = 0;
  const flow = new CloseTransaction({
    requestDraft: () => {},
    accept,
    persist: async () => {
      throw Error("disk");
    },
    failure: (_s, allowed) => {
      failures++;
      return allowed ? "retry" : "cancel";
    },
    finish,
  });
  flow.request();
  await flow.submit({});
  await new Promise((r) => setTimeout(r, 0));
  expect(accept).toHaveBeenCalledOnce();
  expect(failures).toBe(3);
  expect(flow.phase).toBe("idle");
  expect(finish).not.toHaveBeenCalled();
});
it("N05 timeout, duplicate submissions and explicit discard have distinct outcomes", async () => {
  vi.useFakeTimers();
  const finish = vi.fn(),
    accept = vi.fn();
  const flow = new CloseTransaction(
    {
      requestDraft: () => {},
      accept,
      persist: async () => true,
      failure: () => "discard",
      finish,
    },
    25,
  );
  flow.request();
  flow.request();
  await vi.advanceTimersByTimeAsync(25);
  expect(finish).toHaveBeenCalledOnce();
  await flow.submit({});
  expect(accept).not.toHaveBeenCalled();
  vi.useRealTimers();
});
it("N05 cancelled confirmation keeps the window open", async () => {
  const finish = vi.fn();
  const flow = new CloseTransaction({
    requestDraft: () => {},
    accept: () => {},
    persist: async () => false,
    failure: () => "cancel",
    finish,
  });
  flow.request();
  await flow.submit({});
  expect(flow.phase).toBe("idle");
  expect(finish).not.toHaveBeenCalled();
});

it("N05 real validation and expired revision failures leave disk and window untouched", async () => {
  const { ConfigStore, validateConfig } = await import("../electron/storage");
  const { defaults } = await import("../src/core/WorkspaceManager");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const store = new ConfigStore(mkdtempSync(join(tmpdir(), "mvb-close-real-"))),
    c = defaults();
  store.save(c);
  const persist = vi.fn(async () => {
      await store.flush();
      return true;
    }),
    finish = vi.fn();
  const flow = new CloseTransaction({
    requestDraft: () => {},
    accept: (raw) => {
      store.accept(validateConfig(raw));
    },
    persist,
    failure: () => "cancel",
    finish,
  });
  for (const raw of [
    { ...c, revision: 99999 },
    { ...c, version: 9 },
  ]) {
    flow.request();
    await flow.submit(raw);
    expect(flow.phase).toBe("idle");
  }
  expect(persist).not.toHaveBeenCalled();
  expect(finish).not.toHaveBeenCalled();
  expect(store.load()).toEqual(c);
});

it("N05 stalled disk persistence is bounded and does not close after a late completion", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const finish = vi.fn();
  const flow = new CloseTransaction(
    {
      requestDraft: () => {},
      accept: () => {},
      persist: () =>
        new Promise<boolean>((r) => {
          release = () => r(true);
        }),
      failure: () => "cancel",
      finish,
    },
    25,
    50,
  );
  flow.request();
  const flight = flow.submit({});
  await vi.advanceTimersByTimeAsync(51);
  await flight;
  expect(flow.phase).toBe("idle");
  release();
  await Promise.resolve();
  expect(finish).not.toHaveBeenCalled();
  vi.useRealTimers();
});
