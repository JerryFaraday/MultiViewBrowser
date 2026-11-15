import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Config } from "../src/core/model";
import { apiState, roomId, type LiveStates } from "../src/core/LiveStatus";
export type LiveQuery = (
  kind: "room" | "uids",
  ids: string[],
  signal: AbortSignal,
) => Promise<unknown>;
export function nativeLiveQuery(executable: string): LiveQuery {
  return (kind, ids, signal) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(Error("cancelled"));
        return;
      }
      const child = spawn(executable, [kind, ids.join(",")], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
        shell: false,
      });
      let output = "";
      let settled = false;
      const finish = (error?: Error, value?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        if (error) {
          child.kill();
          reject(error);
        } else resolve(value);
      };
      const abort = () => finish(Error("cancelled"));
      const timer = setTimeout(() => finish(Error("network")), 14000);
      signal.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", (b: Buffer) => {
        output += b.toString("utf8");
        if (output.length > 1024 * 1024) finish(Error("api"));
      });
      child.on("error", () => finish(Error("unavailable")));
      child.on("close", (code) => {
        if (settled) return;
        try {
          if (code !== 0) throw Error("network");
          finish(undefined, JSON.parse(output));
        } catch {
          finish(Error("network"));
        }
      });
    });
}
function data(raw: any) {
  if (
    raw?.code !== 0 ||
    !raw.data ||
    typeof raw.data !== "object" ||
    Array.isArray(raw.data)
  )
    throw Error("api");
  return raw.data;
}
function numeric(value: unknown) {
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw Error("api");
  try {
    return roomId(String(value));
  } catch {
    throw Error("api");
  }
}
export class LiveMonitor {
  private signature = "";
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private nextRequest = 0;
  private cache = new Map<
    string,
    { uid: string; room: string; until: number }
  >();
  states: LiveStates = {};
  constructor(
    private query: LiveQuery,
    private publish: (states: LiveStates) => void,
    private spacing = 1000,
  ) {}
  configure(config: Config) {
    if (this.disposed) return;
    const rooms =
      config.bookmarksBar && config.preferences.liveDetection
        ? [
            ...new Set(
              config.favorites
                .filter((f) => f.category === "bilibili-live")
                .map((f) => f.roomId),
            ),
          ].sort()
        : [];
    const signature = JSON.stringify([rooms, config.preferences.liveInterval]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.controller?.abort();
    clearTimeout(this.timer);
    const keep = new Set(rooms);
    for (const key of this.cache.keys())
      if (!keep.has(key)) this.cache.delete(key);
    this.states = Object.fromEntries(
      rooms.map((id) => [
        id,
        this.states[id] ?? { status: "unknown", reason: "pending" },
      ]),
    );
    this.emit();
    if (!rooms.length) return;
    const controller = (this.controller = new AbortController());
    const cycle = async () => {
      await this.cycle(rooms, controller.signal);
      if (!controller.signal.aborted)
        this.timer = setTimeout(
          () => void cycle(),
          config.preferences.liveInterval * 1000,
        );
    };
    void cycle();
  }
  private emit() {
    this.publish(structuredClone(this.states));
  }
  private async request(
    kind: "room" | "uids",
    ids: string[],
    signal: AbortSignal,
  ) {
    await delay(Math.max(0, this.nextRequest - Date.now()), undefined, {
      signal,
    });
    signal.throwIfAborted();
    this.nextRequest = Date.now() + this.spacing;
    const result = await this.query(kind, ids, signal);
    signal.throwIfAborted();
    return data(result);
  }
  private fail(ids: string[], error: unknown, signal: AbortSignal) {
    if (signal.aborted) return;
    const message = error instanceof Error ? error.message : "";
    const reason =
      message === "api"
        ? "api"
        : message === "unavailable"
          ? "unavailable"
          : "network";
    for (const id of ids) this.states[id] = { status: "unknown", reason };
    this.emit();
  }
  private async cycle(rooms: string[], signal: AbortSignal) {
    const resolved = new Map<string, string[]>();
    for (const id of rooms) {
      if (signal.aborted) return;
      try {
        let item = this.cache.get(id);
        if (!item || item.until < Date.now()) {
          const raw = await this.request("room", [id], signal);
          item = {
            uid: numeric(raw.uid),
            room: numeric(raw.room_id),
            until: Date.now() + 3600000,
          };
          this.cache.set(id, item);
        }
        resolved.set(item.uid, [...(resolved.get(item.uid) ?? []), id]);
      } catch (error) {
        this.fail([id], error, signal);
      }
    }
    const uids = [...resolved.keys()];
    for (let i = 0; i < uids.length; i += 50) {
      const batch = uids.slice(i, i + 50),
        ids = batch.flatMap((uid) => resolved.get(uid)!);
      if (signal.aborted) return;
      try {
        const raw = await this.request("uids", batch, signal);
        for (const uid of batch) {
          for (const id of resolved.get(uid)!) {
            try {
              const item = raw[uid];
              if (
                numeric(item?.uid) !== uid ||
                numeric(item?.room_id) !== this.cache.get(id)?.room
              )
                throw Error("api");
              this.states[id] = apiState(item.live_status);
            } catch {
              this.states[id] = { status: "unknown", reason: "api" };
              this.cache.delete(id);
            }
          }
        }
        this.emit();
      } catch (error) {
        this.fail(ids, error, signal);
      }
    }
  }
  dispose() {
    this.disposed = true;
    this.controller?.abort();
    clearTimeout(this.timer);
    this.cache.clear();
    this.states = {};
  }
}
export function liveExecutable(resources: string | undefined) {
  return resources
    ? join(resources, "live-status/LiveStatus.exe")
    : join(__dirname, "../dist-native/LiveStatus.exe");
}
