import type { Config } from "../../src/core/model";
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
  return {
    status: "unknown",
    reason:
      result.status === "LOOP"
        ? "replay"
        : result.reason === "network" || result.reason === "timeout"
          ? "network"
          : result.reason === "unavailable"
            ? "unavailable"
            : "api",
  };
}
// Platform isolation keeps existing Bilibili cache/primary/fallback behavior intact.
export class LiveCoordinator {
  private bili: LiveMonitor;
  private douyu: DouyuAdapter;
  private biliStates: LiveStates = {};
  private douyuStates: LiveStates = {};
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
      (states) => {
        this.biliStates = states;
        this.emit();
      },
      1000,
      persist,
    );
  }
  private emit() {
    if (this.disposed) return;
    this.states = { ...this.biliStates, ...this.douyuStates };
    this.publish(structuredClone(this.states));
  }
  configure(config: Config) {
    if (this.disposed) return;
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
      this.douyuStates = Object.fromEntries(
        rooms.map((id) => [
          "douyu:" + id,
          this.douyuStates["douyu:" + id] ?? {
            status: "unknown",
            reason: "pending",
          },
        ]),
      );
      this.emit();
      if (rooms.length) {
        const controller = (this.controller = new AbortController());
        const cycle = async () => {
          try {
            await this.douyu.queryMany(rooms, {
              signal: controller.signal,
              onResult: (result) => {
                if (controller.signal.aborted || this.disposed) return;
                this.douyuStates["douyu:" + result.inputRoomId] = state(result);
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
    this.bili.dispose();
    this.states = {};
    this.douyuStates = {};
    this.biliStates = {};
  }
}
