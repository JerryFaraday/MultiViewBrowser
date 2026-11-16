import { it, expect } from "vitest";
import { runInNewContext } from "node:vm";
import { suspendMedia, resumeMedia } from "../electron/MediaSuspension";
function fixture() {
  const listeners = new Map<string, Function>();
  class Media {
    paused = false;
    ended = false;
    isConnected = true;
    currentSrc = "fixture";
    srcObject = null;
    plays = 0;
    pause() {
      if (this.paused) return;
      this.paused = true;
      listeners.get("pause")?.({ target: this });
    }
    play() {
      this.paused = false;
      this.plays++;
      return Promise.resolve();
    }
  }
  const playing = new Media(),
    paused = new Media();
  paused.paused = true;
  const context = {
    window: {},
    HTMLMediaElement: Media,
    document: {
      querySelectorAll: () => [playing, paused],
      addEventListener: (name: string, fn: Function) => listeners.set(name, fn),
      removeEventListener: (name: string) => listeners.delete(name),
    },
  };
  return {
    playing,
    paused,
    listeners,
    run: (code: string) => runInNewContext(code, context),
  };
}
it("仅恢复进入策略前正在播放且来源未变的媒体，多次暂停不覆盖快照", () => {
  const f = fixture();
  f.run(suspendMedia);
  f.run(suspendMedia);
  expect(f.playing.paused).toBe(true);
  f.run(resumeMedia);
  expect(f.playing.plays).toBe(1);
  expect(f.paused.plays).toBe(0);
  f.run(resumeMedia);
  expect(f.playing.plays).toBe(1);
});
it("用户主动交互后不自动恢复，来源变更后不自动恢复", () => {
  const f = fixture();
  f.run(suspendMedia);
  f.listeners.get("pointerdown")!({ isTrusted: true });
  f.run(resumeMedia);
  expect(f.playing.plays).toBe(0);
  const g = fixture();
  g.run(suspendMedia);
  g.playing.currentSrc = "replacement";
  g.run(resumeMedia);
  expect(g.playing.plays).toBe(0);
});

it("N03 newly playing media is restored, unless replaced, removed, or user cancelled", () => {
  for (const change of ["none", "source", "removed", "user"]) {
    const f = fixture();
    f.run(suspendMedia);
    // A distinct media instance begins playback while the policy is active.
    const Media = f.playing.constructor as new () => typeof f.playing;
    const added = new Media();
    f.listeners.get("play")!({ target: added });
    expect(added.paused).toBe(true);
    if (change === "source") added.currentSrc = "new";
    if (change === "removed") added.isConnected = false;
    if (change === "user") f.listeners.get("keydown")!({ isTrusted: true });
    f.run(resumeMedia);
    expect(added.plays).toBe(change === "none" ? 1 : 0);
    expect(f.listeners.size).toBe(0);
  }
});
