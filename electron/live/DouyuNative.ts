import { spawn } from "node:child_process";
import type { DouyuResponse, DouyuTransport } from "./Douyu";
// Reuse LiveStatus.exe's WinHTTP async worker, with Douyu-only response framing.
export function nativeDouyuQuery(executable: string): DouyuTransport {
  return (id, signal) =>
    new Promise((resolve, reject) => {
      signal.throwIfAborted();
      if (!/^[1-9]\d{0,19}$/.test(id)) {
        resolve({ httpStatus: 0, error: "api" });
        return;
      }
      const child = spawn(executable, ["douyu", id], {
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "ignore"],
      });
      let output = "",
        settled = false;
      const finish = (result?: DouyuResponse) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        if (!result || result.error) child.kill();
        if (result) resolve(result);
        else reject(new DOMException("Query cancelled", "AbortError"));
      };
      const abort = () => finish();
      const timer = setTimeout(
        () => finish({ httpStatus: 0, error: "timeout" }),
        14000,
      );
      signal.addEventListener("abort", abort, { once: true });
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
        if (output.length > 1024 * 1024 + 256)
          finish({ httpStatus: 0, error: "api" });
      });
      child.on("error", () => finish({ httpStatus: 0, error: "unavailable" }));
      child.on("close", (code) => {
        if (settled) return;
        if (code !== 0) {
          finish({ httpStatus: 0, error: "network" });
          return;
        }
        try {
          const end = output.indexOf("\n"),
            meta = JSON.parse(output.slice(0, end));
          if (
            end < 0 ||
            !Number.isInteger(meta.httpStatus) ||
            meta.httpStatus < 0 ||
            meta.httpStatus > 599 ||
            ![null, "network", "timeout"].includes(meta.error)
          )
            throw Error("api");
          const result: DouyuResponse = { httpStatus: meta.httpStatus };
          if (meta.error) result.error = meta.error;
          else if (meta.httpStatus === 200)
            result.body = JSON.parse(output.slice(end + 1));
          finish(result);
        } catch {
          finish({ httpStatus: 0, error: "api" });
        }
      });
    });
}
