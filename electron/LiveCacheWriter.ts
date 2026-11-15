import type { CacheUpdate } from "../src/core/LiveStatus";
import type { ConfigStore } from "./storage";
import type { Config } from "../src/core/model";
import { logOperation } from "./OperationLogger";
// Only patch the latest matching favorite; never save an earlier config snapshot.
export class LiveCacheWriter {
  private pending = new Map<string, CacheUpdate>();
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  constructor(
    private store: Pick<ConfigStore, "load" | "save">,
    private saved: (config: Config) => void,
    private delay = 500,
  ) {}
  queue(updates: CacheUpdate[]) {
    if (this.disposed) return;
    for (const update of updates)
      this.pending.set(update.favoriteId, structuredClone(update));
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.delay);
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.pending.size) return;
    const updates = [...this.pending.values()];
    this.pending.clear();
    try {
      const latest = this.store.load();
      let changed = false;
      for (const update of updates) {
        const f = latest.favorites.find((f) => f.id === update.favoriteId);
        if (
          !f ||
          f.category !== "bilibili-live" ||
          f.roomId !== update.roomId ||
          update.cache.inputRoomId !== f.roomId
        )
          continue;
        if (JSON.stringify(f.liveCache) === JSON.stringify(update.cache))
          continue;
        f.liveCache = update.cache;
        changed = true;
      }
      if (changed) {
        this.store.save(latest);
        this.saved(this.store.load());
      }
    } catch {
      // Keep updates for the next normal query/write opportunity; no tight retry.
      for (const update of updates)
        if (!this.pending.has(update.favoriteId))
          this.pending.set(update.favoriteId, update);
      logOperation("app.error", { status: "failed" });
    }
  }
  dispose() {
    this.flush();
    this.disposed = true;
  }
}
