import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Config } from "../src/core/model";
import {
  apiState,
  roomId,
  mappingDue,
  type LiveCache,
  type CacheUpdate,
  type LiveStates,
} from "../src/core/LiveStatus";
export type LiveQuery = (
  kind: "room" | "uids" | "rooms",
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
class LiveApiError extends Error {
  constructor(readonly code: number) {
    super("api");
  }
}
function data(raw: any) {
  if (typeof raw?.code === "number" && raw.code !== 0)
    throw new LiveApiError(raw.code);
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
  private nextValidation = 0;
  private cache = new Map<string, LiveCache>();
  private favorites: Pick<
    Config["favorites"][number],
    "id" | "roomId" | "liveCache"
  >[] = [];
  private verification = new Map<
    string,
    { signal: AbortSignal; token: object }
  >();
  private verifying = false;
  states: LiveStates = {};
  constructor(
    private query: LiveQuery,
    private publish: (states: LiveStates) => void,
    private spacing = 1000,
    private persist: (updates: CacheUpdate[]) => void = () => {},
  ) {}
  configure(config: Config) {
    if (this.disposed) return;
    this.favorites = config.favorites
      .filter((f) => f.category === "bilibili-live")
      .map((f) => ({ id: f.id, roomId: f.roomId, liveCache: f.liveCache }));
    const retained = new Set(this.favorites.map((f) => f.roomId));
    for (const key of this.cache.keys())
      if (!retained.has(key)) this.cache.delete(key);
    for (const f of this.favorites) {
      const c = f.liveCache;
      if (
        c &&
        c.inputRoomId === f.roomId &&
        (!this.cache.has(f.roomId) ||
          c.checkedAt > this.cache.get(f.roomId)!.checkedAt)
      )
        this.cache.set(f.roomId, c);
    }
    const enabled = config.bookmarksBar && config.preferences.liveDetection;
    const identities = enabled
      ? this.favorites
          .map((f) => [f.id, f.roomId])
          .sort((a, b) => a[0].localeCompare(b[0]))
      : [];
    const rooms = enabled ? [...retained].sort() : [];
    const signature = JSON.stringify([
      identities,
      config.preferences.liveInterval,
    ]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.controller?.abort();
    clearTimeout(this.timer);
    this.verification.clear();
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
    kind: "room" | "uids" | "rooms",
    ids: string[],
    signal: AbortSignal,
    background = false,
  ) {
    const next = background ? this.nextValidation : this.nextRequest;
    await delay(Math.max(0, next - Date.now()), undefined, { signal });
    signal.throwIfAborted();
    if (background) this.nextValidation = Date.now() + this.spacing;
    else this.nextRequest = Date.now() + this.spacing;
    const raw = await this.query(kind, ids, signal);
    signal.throwIfAborted();
    return data(raw);
  }
  private remember(
    id: string,
    realRoomId: string,
    uid: string,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const old = this.cache.get(id);
    const cache: LiveCache =
      old &&
      old.realRoomId === realRoomId &&
      old.uid === uid &&
      !mappingDue(old)
        ? old
        : {
            formatVersion: 1,
            inputRoomId: id,
            realRoomId,
            uid,
            checkedAt: Date.now(),
          };
    this.cache.set(id, cache);
    const updates = this.favorites
      .filter(
        (f) =>
          f.roomId === id &&
          JSON.stringify(f.liveCache) !== JSON.stringify(cache),
      )
      .map((f) => ({ favoriteId: f.id, roomId: id, cache }));
    if (updates.length) this.persist(updates);
    return cache;
  }
  private fail(ids: string[], error: unknown, signal: AbortSignal) {
    if (signal.aborted) return;
    const reason =
      error instanceof Error && error.message === "unavailable"
        ? "unavailable"
        : error instanceof Error && error.message === "api"
          ? "api"
          : "network";
    for (const id of ids) this.states[id] = { status: "unknown", reason };
    this.emit();
  }
  private async resolve(id: string, signal: AbortSignal, background = false) {
    const raw = await this.request("room", [id], signal, background);
    const result = this.remember(
      id,
      numeric(raw.room_id),
      numeric(raw.uid),
      signal,
    );
    return { cache: result, status: apiState(raw.live_status) };
  }
  // Separate, bounded validation lane: status requests never await its network IO.
  private validate(ids: string[], signal: AbortSignal) {
    for (const id of ids)
      if (!this.verification.has(id))
        this.verification.set(id, { signal, token: {} });
    if (this.verifying) return;
    this.verifying = true;
    const pump = async () => {
      try {
        while (this.verification.size && !this.disposed) {
          const [id, job] = this.verification.entries().next().value!;
          try {
            if (!job.signal.aborted) {
              const result = await this.resolve(id, job.signal, true);
              this.states[id] = result.status;
              this.emit();
            }
          } catch (error) {
            if (
              !job.signal.aborted &&
              error instanceof LiveApiError &&
              [60004, -403].includes(error.code)
            ) {
              this.states[id] = { status: "unknown", reason: "api" };
              this.emit();
            }
          } finally {
            if (this.verification.get(id)?.token === job.token)
              this.verification.delete(id);
          }
        }
      } finally {
        this.verifying = false;
      }
    };
    void pump();
  }
  private async fallback(
    ids: string[],
    signal: AbortSignal,
    force: Set<string>,
  ) {
    const ready = new Map<string, LiveCache>(),
      missing: string[] = [];
    for (const id of ids) {
      const cached = this.cache.get(id);
      if (cached) ready.set(id, cached);
      else missing.push(id);
    }
    const poll = async (entries: Map<string, LiveCache>) => {
      const uids = [...new Set([...entries.values()].map((c) => c.uid))];
      for (let i = 0; i < uids.length; i += 50) {
        if (signal.aborted) return;
        const batch = uids.slice(i, i + 50),
          targets = [...entries].filter(([, c]) => batch.includes(c.uid));
        try {
          const raw = await this.request("uids", batch, signal);
          for (const [id, cached] of targets) {
            const current = this.cache.get(id);
            if (
              current?.uid !== cached.uid ||
              current.realRoomId !== cached.realRoomId
            )
              continue;
            try {
              const item = raw[cached.uid];
              if (
                numeric(item?.uid) !== cached.uid ||
                numeric(item?.room_id) !== cached.realRoomId
              )
                throw Error("api");
              const confirms =
                id === cached.realRoomId || String(item.short_id) === id;
              if (confirms) {
                this.remember(id, cached.realRoomId, cached.uid, signal);
                force.delete(id);
              }
              this.states[id] =
                force.has(id) && !confirms
                  ? { status: "unknown", reason: "api" }
                  : apiState(item.live_status);
            } catch {
              this.states[id] = { status: "unknown", reason: "api" };
              force.add(id);
            }
          }
          this.emit();
        } catch (error) {
          this.fail(
            targets.map(([id]) => id),
            error,
            signal,
          );
          if (
            error instanceof LiveApiError &&
            [60004, -403].includes(error.code)
          )
            for (const [id] of targets) force.add(id);
        }
      }
    };
    await poll(ready);
    const resolved = new Map<string, LiveCache>();
    for (const id of missing) {
      if (signal.aborted) return;
      try {
        resolved.set(id, (await this.resolve(id, signal)).cache);
        force.delete(id);
      } catch (error) {
        this.fail([id], error, signal);
      }
    }
    await poll(resolved);
    if (!signal.aborted)
      this.validate(
        ids.filter(
          (id) =>
            this.cache.has(id) &&
            (force.has(id) || mappingDue(this.cache.get(id)!)),
        ),
        signal,
      );
  }
  private async cycle(rooms: string[], signal: AbortSignal) {
    const fallback: string[] = [],
      force = new Set<string>();
    for (let i = 0; i < rooms.length; i += 50) {
      if (signal.aborted) return;
      const batch = rooms.slice(i, i + 50);
      try {
        const raw = await this.request("rooms", batch, signal);
        for (const id of batch) {
          const candidates = Object.entries(raw).filter(
            ([key, item]: [string, any]) =>
              String(item?.roomid) === id ||
              String(item?.short_id) === id ||
              key === id,
          );
          try {
            if (candidates.length !== 1) throw Error("api");
            const [key, item] = candidates[0] as [string, any];
            const real = numeric(item.roomid),
              uid = numeric(item.uid);
            if (
              numeric(key) !== real ||
              (id !== real && String(item.short_id) !== id)
            )
              throw Error("api");
            this.remember(id, real, uid, signal);
            if (typeof item.live_status !== "number") throw Error("api");
            this.states[id] = apiState(item.live_status);
          } catch {
            fallback.push(id);
          }
        }
        this.emit();
      } catch (error) {
        fallback.push(...batch);
        if (error instanceof LiveApiError && [60004, -403].includes(error.code))
          for (const id of batch) force.add(id);
      }
    }
    if (!signal.aborted && fallback.length)
      await this.fallback([...new Set(fallback)], signal, force);
  }
  dispose() {
    this.disposed = true;
    this.controller?.abort();
    clearTimeout(this.timer);
    this.verification.clear();
    this.cache.clear();
    this.states = {};
  }
}
export function liveExecutable(resources: string | undefined) {
  return resources
    ? join(resources, "live-status/LiveStatus.exe")
    : join(__dirname, "../dist-native/LiveStatus.exe");
}
