import type { WebContentsView } from "electron";
import type { Preferences } from "../src/core/Preferences";
const safeToRelease = `(() => {
 if(window.onbeforeunload||document.querySelector('input,textarea,select,[contenteditable],iframe,frame'))return false;
 for(const media of document.querySelectorAll('audio,video'))if(!media.paused&&!media.ended||media.srcObject)return false;
 return true;
})()`;
/** Eligibility is conservative. Beforeunload gets the final veto, never a forced close. */
export class StashRelease {
  readonly released = new Set<string>();
  private ages = new Map<string, number>();
  private dirty = new Set<string>();
  private nextChecks = new Map<string, number>();
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  markDirty(id: string) {
    this.dirty.add(id);
  }
  reset(id: string) {
    this.dirty.delete(id);
  }
  sync(
    prefs: Preferences,
    retained: { id: string; parkedAt?: number }[],
    views: Map<string, WebContentsView>,
    onRelease: (id: string, view: WebContentsView) => void,
  ) {
    clearTimeout(this.timer);
    const generation = ++this.generation;
    const ids = new Set(retained.map((p) => p.id));
    for (const id of this.ages.keys())
      if (!ids.has(id)) {
        this.ages.delete(id);
        this.nextChecks.delete(id);
      }
    for (const id of this.released) if (!ids.has(id)) this.released.delete(id);
    if (!prefs.autoReleaseStash) return;
    const now = Date.now(),
      delay = prefs.stashReleaseMinutes * 60000;
    for (const p of retained)
      if (!this.ages.has(p.id))
        this.ages.set(p.id, Math.min(now, p.parkedAt ?? now));
    const run = async () => {
      if (generation !== this.generation) return;
      for (const id of ids) {
        if (Date.now() < (this.nextChecks.get(id) ?? 0)) continue;
        this.nextChecks.set(id, Date.now() + 5 * 60000);
        const view = views.get(id);
        if (
          !view ||
          view.getVisible() ||
          view.webContents.isDestroyed() ||
          this.dirty.has(id) ||
          Date.now() - (this.ages.get(id) ?? Date.now()) < delay
        )
          continue;
        const wc = view.webContents;
        let safe = false;
        try {
          safe = await wc.executeJavaScript(safeToRelease);
        } catch {}
        if (generation !== this.generation) return;
        if (
          !safe ||
          view.getVisible() ||
          views.get(id) !== view ||
          this.dirty.has(id) ||
          wc.isDestroyed() ||
          wc.isLoading() ||
          wc.isCurrentlyAudible()
        )
          continue;
        // A listener registered with addEventListener('beforeunload') also vetoes close.
        let veto = false;
        const prevent = () => {
          veto = true;
          wc.removeListener("destroyed", destroyed);
        };
        wc.once("will-prevent-unload", prevent);
        const destroyed = () => {
          if (!veto) {
            this.released.add(id);
            onRelease(id, view);
          }
        };
        wc.once("destroyed", destroyed);
        wc.close({ waitForBeforeUnload: true });
      }
      if (generation === this.generation) {
        this.timer = setTimeout(run, 5 * 60000);
        this.timer.unref?.();
      }
    };
    const deadlines = [...ids]
      .filter((id) => !this.released.has(id))
      .map((id) =>
        Math.max(
          0,
          (this.ages.get(id) ?? now) + delay - now,
          (this.nextChecks.get(id) ?? 0) - now,
        ),
      );
    if (deadlines.length) {
      this.timer = setTimeout(run, Math.max(1000, Math.min(...deadlines)));
      this.timer.unref?.();
    }
  }
  destroy() {
    this.generation++;
    clearTimeout(this.timer);
    this.ages.clear();
    this.nextChecks.clear();
    this.dirty.clear();
    this.released.clear();
  }
}
