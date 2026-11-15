import { closeSync, mkdirSync, openSync, writeSync, write } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  sanitizeOperation,
  type OperationEvent,
  type LogDetails,
} from "../src/core/OperationLog";
export class OperationLogger {
  readonly file: string;
  private fd: number | undefined;
  private sequence = 0;
  private started = Date.now();
  private records: any[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private flight?: Promise<void>;
  private ending?: Promise<void>;
  private stopped = false;
  private last?: { row: any; signature: string; at: number };
  private bytes = 0;
  private dropped = 0;
  private retryBuffer?: Buffer;
  mode: "normal" | "detailed" = "detailed";
  constructor(folder: string, version: string) {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(version))
      throw Error("Invalid log version");
    mkdirSync(folder, { recursive: true });
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .format(new Date(this.started))
      .replace(/[ :]/g, "-");
    this.file = join(
      folder,
      `MultiViewBrowser_V${version}_${parts}_${this.started % 1000}_${process.pid}_${randomUUID().slice(0, 8)}.log`,
    );
    this.fd = openSync(this.file, "wx");
    this.records.push({
      seq: ++this.sequence,
      time: new Date().toISOString(),
      elapsedMs: 0,
      event: "session.start",
      version: "V" + version,
    });
    this.schedule();
  }
  write(event: unknown, raw: unknown = {}) {
    if (this.fd === undefined || this.stopped) return;
    const entry = sanitizeOperation(event, raw);
    if (!entry) return;
    const noisy = [
      "ui.hover",
      "ui.pointer_down",
      "ui.input",
      "ui.key",
      "web.input",
      "web.key",
      "web.scroll",
      "app.resize",
    ].includes(entry.event);
    if (this.mode === "normal" && noisy) return;
    if (this.bytes >= 16 * 1024 * 1024 && event !== "session.end") {
      this.dropped++;
      return;
    }
    const now = Date.now(),
      signature = JSON.stringify(entry);
    if (
      noisy &&
      this.last?.signature === signature &&
      now - this.last.at < 100
    ) {
      const old = Buffer.byteLength(JSON.stringify(this.last.row));
      this.last.row.repeat = (this.last.row.repeat ?? 1) + 1;
      this.last.row.lastTime = new Date(now).toISOString();
      this.last.row.endSeq = ++this.sequence;
      this.last.at = now;
      this.bytes += Buffer.byteLength(JSON.stringify(this.last.row)) - old;
    } else {
      const row = {
        seq: ++this.sequence,
        time: new Date().toISOString(),
        elapsedMs: Date.now() - this.started,
        event: entry.event,
        ...entry.details,
      };
      this.records.push(row);
      this.bytes += Buffer.byteLength(JSON.stringify(row)) + 1;
      this.last = { row, signature, at: now };
    }
    this.schedule();
    if (
      this.records.length >= 512 ||
      ["app.error", "app.close_requested"].includes(entry.event)
    )
      void this.flush().catch(() => {});
  }
  private schedule() {
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush().catch(() => {});
      }, 200);
      this.timer.unref?.();
    }
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.flight) return this.flight.then(() => this.flush());
    if (this.fd === undefined || (!this.retryBuffer && !this.records.length))
      return Promise.resolve();
    const fd = this.fd,
      buffer =
        this.retryBuffer ??
        Buffer.from(this.records.map((r) => JSON.stringify(r) + "\n").join(""));
    if (!this.retryBuffer) {
      this.records = [];
      this.last = undefined;
    }
    this.retryBuffer = undefined;
    this.flight = new Promise<void>((resolve, reject) => {
      let offset = 0;
      const next = () =>
        write(
          fd,
          buffer,
          offset,
          buffer.length - offset,
          null,
          (error, written) => {
            if (error || written === 0) {
              this.retryBuffer = buffer.subarray(offset);
              reject(error ?? Error("log write"));
              return;
            }
            offset += written;
            if (offset < buffer.length) next();
            else resolve();
          },
        );
      next();
    }).finally(() => {
      this.flight = undefined;
    });
    return this.flight.then(() => this.flush());
  }
  end(): Promise<void> {
    if (this.ending) return this.ending;
    if (this.fd === undefined) return Promise.resolve();
    if (!this.stopped) {
      if (this.dropped)
        this.records.push({
          seq: ++this.sequence,
          time: new Date().toISOString(),
          elapsedMs: Date.now() - this.started,
          event: "log.capacity",
          count: this.dropped,
        });
      this.write("session.end", { status: "normal" });
    }
    this.stopped = true;
    return (this.ending = this.flush().then(
      () => {
        if (this.fd !== undefined) closeSync(this.fd);
        this.fd = undefined;
      },
      (error) => {
        this.ending = undefined;
        throw error;
      },
    ));
  }
  endSync() {
    if (this.fd === undefined || this.flight) return;
    if (!this.stopped) this.write("session.end", { status: "normal" });
    clearTimeout(this.timer);
    try {
      if (this.retryBuffer) writeSync(this.fd, this.retryBuffer);
      writeSync(
        this.fd,
        this.records.map((r) => JSON.stringify(r) + "\n").join(""),
      );
    } finally {
      closeSync(this.fd);
      this.fd = undefined;
      this.records = [];
      this.stopped = true;
    }
  }
}
let active: OperationLogger | undefined;
export function operationLogLocation() {
  return active
    ? { folder: dirname(active.file), file: active.file }
    : undefined;
}
export function setOperationLogger(logger: OperationLogger) {
  active = logger;
}
export function logOperation(event: OperationEvent, details: LogDetails = {}) {
  active?.write(event, details);
}
export function finishOperationLog() {
  return active?.end() ?? Promise.resolve();
}
export function finishOperationLogSync() {
  try {
    active?.endSync();
  } catch {
    /* Abnormal exit cannot await or repair an unavailable disk. */
  }
}
export function setOperationLogMode(mode: "normal" | "detailed") {
  if (active) active.mode = mode;
}
