import type { Config } from "../../src/core/model";
import { liveKey } from "../../src/core/LiveStatus";
import { LiveDisplay } from "./LiveDisplay";
import { logOperation } from "../OperationLogger";
import type {
  CacheUpdate,
  LiveState,
  LiveStates,
} from "../../src/core/LiveStatus";
import { LiveMonitor, type LiveQuery } from "../LiveMonitor";
import { DouyuAdapter, type DouyuResult, type DouyuTransport } from "./Douyu";
function state(result: DouyuResult): LiveState {
  if (result.status === "LIVE") return { status: "live" };
  if (result.status === "OFFLINE") return { status: "offline" };
  if (result.status === "LOOP") return { status: "offline", reason: "replay" };
  return {
    status: "unknown",
    reason:
      result.reason === "network" || result.reason === "timeout"
        ? "network"
        : result.reason === "parse" || result.reason === "indeterminate"
          ? result.reason
          : result.reason === "unavailable"
            ? "unavailable"
            : "api",
  };
}
// Platform isolation keeps existing Bilibili cache/primary/fallback behavior intact.
export class LiveCoordinator {
  private bili: LiveMonitor;
  private douyu: DouyuAdapter;
  private display = new LiveDisplay();
  private keys = new Set<string>();
  private expiry?: ReturnType<typeof setTimeout>;
  private douyuRound = 0;
  private signature = "";
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  states: LiveStates = {};
  constructor(
    biliQuery: LiveQuery,
    douyuQuery: DouyuTransport,
    private publish: (states: LiveStates) => void,
    persist: (updates: CacheUpdate[]) => void = () => {},
  ) {
    this.douyu = new DouyuAdapter(douyuQuery);
    this.bili = new LiveMonitor(
      biliQuery,
      () => this.emit(),
      1000,
      persist,
      (id, state, round) => this.record(id, state, round),
    );
  }
  private record(key: string, state: LiveState, round: number) {
    if (this.disposed || !this.keys.has(key)) return;
    if (state.status === "unknown" && state.reason !== "pending")
      logOperation("live.detect_error", {
        action: key.startsWith("douyu:") ? "live.douyu" : "live.bilibili",
        status: state.reason ?? "indeterminate",
      });
    this.display.accept(key, state, round);
  }
  private emit() {
    if (this.disposed) return;
    this.states = this.display.snapshot(this.keys);
    this.publish(structuredClone(this.states));
    clearTimeout(this.expiry);
    const next = this.display.nextExpiry();
    if (Number.isFinite(next))
      this.expiry = setTimeout(() => this.emit(), Math.max(1, next));
  }
  configure(config: Config) {
    if (this.disposed) return;
    this.keys = new Set(
      config.bookmarksBar && config.preferences.liveDetection
        ? config.favorites.filter((f) => f.category !== "web").map(liveKey)
        : [],
    );
    this.display.retain(this.keys);
    this.display.validForMs = Math.max(
      120000,
      config.preferences.liveInterval * 2000 + 30000,
    );
    const rooms =
      config.bookmarksBar && config.preferences.liveDetection
        ? [
            ...new Set(
              config.favorites
                .filter((f) => f.category === "douyu-live")
                .map((f) => f.roomId),
            ),
          ].sort()
        : [];
    const signature = JSON.stringify([rooms, config.preferences.liveInterval]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.controller?.abort();
      clearTimeout(this.timer);
      this.emit();
      if (rooms.length) {
        const controller = (this.controller = new AbortController());
        const cycle = async () => {
          const round = ++this.douyuRound;
          try {
            await this.douyu.queryMany(rooms, {
              signal: controller.signal,
              onResult: (result) => {
                if (controller.signal.aborted || this.disposed) return;
                this.record(
                  "douyu:" + result.inputRoomId,
                  state(result),
                  round,
                );
                this.emit();
              },
            });
          } catch {
            // Cancellation deliberately publishes nothing; per-room failures
            // are structured UNKNOWN results and never reject other rooms.
          }
          if (!controller.signal.aborted && !this.disposed)
            this.timer = setTimeout(
              () => void cycle(),
              config.preferences.liveInterval * 1000,
            );
        };
        void cycle();
      }
    }
    this.bili.configure(config);
  }
  dispose() {
    this.disposed = true;
    this.controller?.abort();
    clearTimeout(this.timer);
    clearTimeout(this.expiry);
    this.bili.dispose();
    this.states = {};
    this.keys.clear();
    this.display.retain(this.keys);
  }
}
