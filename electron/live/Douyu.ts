import { setMaxListeners } from "node:events";
export type DouyuStatus = "LIVE" | "LOOP" | "OFFLINE" | "UNKNOWN";
export type DouyuReason =
  | "invalid-room"
  | "network"
  | "timeout"
  | "http"
  | "api"
  | "parse"
  | "indeterminate"
  | "unavailable";
export type DouyuResult = {
  platform: "douyu";
  inputRoomId: string;
  realRoomId?: string;
  status: DouyuStatus;
  reason?: DouyuReason;
  httpStatus?: number;
  source?: "betard" | "room-api";
};
export type DouyuResponse = {
  httpStatus: number;
  body?: unknown;
  error?: "network" | "timeout" | "api" | "parse" | "unavailable";
};
export type DouyuTransport = (
  roomId: string,
  signal: AbortSignal,
) => Promise<DouyuResponse>;
type Options = {
  concurrency?: number;
  intervalMs?: number;
  retries?: number;
  backoffMs?: number;
  timeoutMs?: number;
};
type QueryOptions = {
  signal?: AbortSignal;
  onResult?: (result: DouyuResult) => void;
};
function normalize(value: unknown): string | undefined {
  if (typeof value === "number" && !Number.isSafeInteger(value)) return;
  if (typeof value !== "number" && typeof value !== "string") return;
  const s = String(value);
  if (!/^\d{1,20}$/.test(s) || /^0+$/.test(s)) return;
  return String(BigInt(s));
}
function flag(value: unknown): number | undefined {
  if (value === 0 || value === "0") return 0;
  if (value === 1 || value === "1") return 1;
}
export function parseDouyu(roomId: string, body: unknown): DouyuResult {
  const inputRoomId = normalize(roomId);
  const base: DouyuResult = {
    platform: "douyu",
    inputRoomId: inputRoomId ?? roomId,
    status: "UNKNOWN",
  };
  if (!inputRoomId) return { ...base, reason: "invalid-room" };
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error !== 0 &&
    body.error !== "0" &&
    body.error != null
  )
    return { ...base, reason: "api" };
  const room =
    body && typeof body === "object" && "room" in body ? body.room : undefined;
  if (!room || typeof room !== "object" || Array.isArray(room))
    return { ...base, reason: "parse" };
  const data = room as Record<string, unknown>,
    realRoomId = normalize(data.room_id);
  if (!realRoomId) return { ...base, reason: "parse" };
  const mapped = { ...base, realRoomId },
    show =
      data.show_status === 2 || data.show_status === "2"
        ? 2
        : flag(data.show_status),
    loop = flag(data.videoLoop);
  // Missing/unsupported flags cannot establish a reliable state, even offline.
  if (show === undefined || loop === undefined)
    return {
      ...mapped,
      reason:
        data.show_status == null || data.videoLoop == null
          ? "parse"
          : "indeterminate",
    };
  return {
    ...mapped,
    status: show !== 1 ? "OFFLINE" : loop === 1 ? "LOOP" : "LIVE",
  };
}
export function parseDouyuRoomApi(roomId: string, body: unknown): DouyuResult {
  const id = normalize(roomId),
    base: DouyuResult = {
      platform: "douyu",
      inputRoomId: id ?? roomId,
      status: "UNKNOWN",
      source: "room-api",
    };
  if (!id) return { ...base, reason: "invalid-room" };
  if (!body || typeof body !== "object" || Array.isArray(body))
    return { ...base, reason: "parse" };
  const raw = body as Record<string, unknown>;
  if (raw.error !== 0 && raw.error !== "0")
    return { ...base, reason: raw.error == null ? "parse" : "api" };
  if (!raw.data || typeof raw.data !== "object" || Array.isArray(raw.data))
    return { ...base, reason: "parse" };
  const data = raw.data as Record<string, unknown>,
    realRoomId = normalize(data.room_id);
  if (!realRoomId) return { ...base, reason: "parse" };
  const mapped = { ...base, realRoomId };
  // RoomApi uses data.room_status, not betard's show_status/videoLoop.
  // Its 0/2 mean not broadcasting. A 1 cannot exclude replay by itself.
  if (
    data.room_status === 0 ||
    data.room_status === "0" ||
    data.room_status === 2 ||
    data.room_status === "2"
  )
    return { ...mapped, status: "OFFLINE" };
  return {
    ...mapped,
    reason: data.room_status == null ? "parse" : "indeterminate",
  };
}
function aborted() {
  return new DOMException("Query cancelled", "AbortError");
}
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
type Job = {
  run: () => Promise<DouyuResponse>;
  resolve: (r: DouyuResponse) => void;
  reject: (e: unknown) => void;
  signal: AbortSignal;
  remove: () => void;
};
// No timer/polling until explicitly queried. Limits span all callers of this adapter.
export class DouyuAdapter {
  private concurrency: number;
  private intervalMs: number;
  private retries: number;
  private backoffMs: number;
  private timeoutMs: number;
  private active = 0;
  private nextStart = 0;
  private queue: Job[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private transport: DouyuTransport,
    options: Options = {},
    private fallback?: DouyuTransport,
  ) {
    this.concurrency = options.concurrency ?? 3;
    this.intervalMs = options.intervalMs ?? 250;
    this.retries = options.retries ?? 2;
    this.backoffMs = options.backoffMs ?? 500;
    this.timeoutMs = options.timeoutMs ?? 14000;
    if (
      !Number.isInteger(this.concurrency) ||
      this.concurrency < 1 ||
      this.concurrency > 8 ||
      !Number.isInteger(this.retries) ||
      this.retries < 0 ||
      this.retries > 2 ||
      !Number.isFinite(this.intervalMs) ||
      this.intervalMs < 0 ||
      this.intervalMs > 60000 ||
      !Number.isFinite(this.backoffMs) ||
      this.backoffMs < 0 ||
      this.backoffMs > 30000 ||
      !Number.isFinite(this.timeoutMs) ||
      this.timeoutMs < 1 ||
      this.timeoutMs > 60000
    )
      throw Error("Invalid Douyu query limits");
  }
  private pump() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.active >= this.concurrency || !this.queue.length) return;
    const delay = this.nextStart - Date.now();
    if (delay > 0) {
      this.timer = setTimeout(() => this.pump(), delay);
      return;
    }
    const job = this.queue.shift()!;
    job.remove();
    if (job.signal.aborted) {
      job.reject(aborted());
      this.pump();
      return;
    }
    this.active++;
    this.nextStart = Date.now() + this.intervalMs;
    void Promise.resolve()
      .then(job.run)
      .then(job.resolve, job.reject)
      .finally(() => {
        this.active--;
        this.pump();
      });
    this.pump();
  }
  private schedule(run: Job["run"], signal: AbortSignal) {
    return new Promise<DouyuResponse>((resolve, reject) => {
      signal.throwIfAborted();
      const abort = () => {
        this.queue = this.queue.filter((j) => j !== job);
        reject(aborted());
        this.pump();
      };
      const job: Job = {
        run,
        signal,
        resolve,
        reject,
        remove: () => signal.removeEventListener("abort", abort),
      };
      signal.addEventListener("abort", abort, { once: true });
      this.queue.push(job);
      this.pump();
    });
  }
  private async attempt(
    id: string,
    signal: AbortSignal,
    backup = false,
  ): Promise<DouyuResponse> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.throwIfAborted();
    signal.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let remove = () => {};
    try {
      const cancelled = new Promise<never>((_, reject) => {
        const stop = () => reject(aborted());
        controller.signal.addEventListener("abort", stop, { once: true });
        remove = () => controller.signal.removeEventListener("abort", stop);
      });
      timer = setTimeout(() => controller.abort(), this.timeoutMs);
      return await Promise.race([
        (backup ? this.fallback! : this.transport)(id, controller.signal),
        cancelled,
      ]);
    } catch {
      signal.throwIfAborted();
      return {
        httpStatus: 0,
        error: controller.signal.aborted ? "timeout" : "network",
      };
    } finally {
      clearTimeout(timer);
      remove();
      signal.removeEventListener("abort", abort);
    }
  }
  private async endpoint(
    id: string,
    signal: AbortSignal,
    backup = false,
  ): Promise<DouyuResult> {
    const base: DouyuResult = {
      platform: "douyu",
      inputRoomId: id,
      status: "UNKNOWN",
      source: backup ? "room-api" : "betard",
    };
    for (let attempt = 0; ; attempt++) {
      const response = await this.schedule(
        () => this.attempt(id, signal, backup),
        signal,
      );
      signal.throwIfAborted();
      const retry =
        response.error === "network" ||
        response.error === "timeout" ||
        response.httpStatus === 429 ||
        [500, 502, 503, 504].includes(response.httpStatus);
      if (retry && attempt < this.retries) {
        // Backoff holds no concurrency slot, leaving healthy rooms unblocked.
        await wait(this.backoffMs * 2 ** attempt, signal);
        continue;
      }
      if (response.error) return { ...base, reason: response.error };
      if (response.httpStatus !== 200)
        return { ...base, reason: "http", httpStatus: response.httpStatus };
      return backup
        ? parseDouyuRoomApi(id, response.body)
        : { ...parseDouyu(id, response.body), source: "betard" };
    }
  }
  private async one(id: string, signal: AbortSignal) {
    const primary = await this.endpoint(id, signal);
    signal.throwIfAborted();
    return primary.status === "UNKNOWN" && this.fallback
      ? this.endpoint(id, signal, true)
      : primary;
  }
  async query(
    roomId: string,
    options: QueryOptions = {},
  ): Promise<DouyuResult> {
    return (await this.queryMany([roomId], options))[0];
  }
  async queryMany(
    roomIds: readonly string[],
    options: QueryOptions = {},
  ): Promise<DouyuResult[]> {
    options.signal?.throwIfAborted();
    const controller = new AbortController(),
      signal = controller.signal;
    // A round may queue many rooms. Only this private signal fans out; do not
    // change listener limits or otherwise mutate the caller's AbortSignal.
    setMaxListeners(0, signal);
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abort, { once: true });
    const unique = new Map<string, Promise<DouyuResult>>();
    try {
      return await Promise.all(
        roomIds.map((value) => {
          const id = normalize(value);
          const key = id ?? `invalid:${value}`;
          let result = unique.get(key);
          if (!result) {
            const query = id
              ? this.one(id, signal)
              : Promise.resolve<DouyuResult>({
                  platform: "douyu",
                  inputRoomId: value,
                  status: "UNKNOWN",
                  reason: "invalid-room",
                });
            result = query.then((r) => {
              signal.throwIfAborted();
              options.onResult?.(structuredClone(r));
              return r;
            });
            unique.set(key, result);
          }
          return result.then((r) => structuredClone(r));
        }),
      );
    } catch (error) {
      controller.abort();
      throw error;
    } finally {
      options.signal?.removeEventListener("abort", abort);
    }
  }
}
