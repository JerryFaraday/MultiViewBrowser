import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
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
    writeSync(
      this.fd,
      JSON.stringify({
        seq: ++this.sequence,
        time: new Date().toISOString(),
        elapsedMs: 0,
        event: "session.start",
        version: "V" + version,
      }) + "\n",
    );
  }
  write(event: unknown, raw: unknown = {}) {
    if (this.fd === undefined) return;
    const entry = sanitizeOperation(event, raw);
    if (!entry) return;
    try {
      writeSync(
        this.fd,
        JSON.stringify({
          seq: ++this.sequence,
          time: new Date().toISOString(),
          elapsedMs: Date.now() - this.started,
          event: entry.event,
          ...entry.details,
        }) + "\n",
      );
    } catch {
      try {
        closeSync(this.fd);
      } catch {}
      this.fd = undefined;
    }
  }
  end() {
    if (this.fd === undefined) return;
    this.write("session.end", { status: "normal" });
    if (this.fd !== undefined) {
      closeSync(this.fd);
      this.fd = undefined;
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
  active?.end();
}
