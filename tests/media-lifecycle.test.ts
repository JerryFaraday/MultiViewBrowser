import { it, expect } from "vitest";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
it("页面重绘及隐藏零音量媒体不污染主播放器，重挂载复用增益链路", () => {
  let receive: Function = () => {},
    loaded: Function = () => {},
    mutate: Function = () => {};
  const listeners = new Map<string, Function>(),
    sent: unknown[][] = [];
  const media = {
    readyState: 4,
    paused: false,
    currentSrc: "https://example.com/live",
    volume: 1,
    crossOrigin: null,
    isConnected: true,
  };
  let sources = 0,
    connections = 0;
  const gain = {
    gain: { value: 1 },
    connect() {
      connections++;
    },
    disconnect() {},
  };
  class AudioContext {
    state = "running";
    destination = {};
    createMediaElementSource() {
      sources++;
      return { connect() {} };
    }
    createGain() {
      return gain;
    }
    resume() {
      return Promise.resolve();
    }
  }
  class MutationObserver {
    constructor(fn: Function) {
      mutate = fn;
    }
    observe() {}
  }
  let extra: typeof media | undefined;
  const childDocument = {
    addEventListener: (name: string, fn: Function) => listeners.set(name, fn),
    querySelectorAll: (selector: string) =>
      selector === "iframe"
        ? []
        : [...(media.isConnected ? [media] : []), ...(extra ? [extra] : [])],
  };
  runInNewContext(
    buildSync({
      entryPoints: ["electron/media-preload.ts"],
      bundle: true,
      platform: "node",
      format: "cjs",
      external: ["electron"],
      write: false,
    }).outputFiles[0].text,
    {
      require: () => ({
        ipcRenderer: {
          on: (name: string, fn: Function) => {
            if (name === "audio-settings") receive = fn;
          },
          send: (...args: unknown[]) => sent.push(args),
        },
      }),
      AudioContext,
      MutationObserver,
      URL,
      location: { href: "https://example.com", origin: "https://example.com" },
      window: {
        addEventListener: (_name: string, fn: Function) => (loaded = fn),
      },
      document: {
        documentElement: {},
        addEventListener: (name: string, fn: Function) =>
          listeners.set(name, fn),
        querySelectorAll: (selector: string) =>
          selector === "iframe" ? [{ contentDocument: childDocument }] : [],
      },
    },
  );
  loaded();
  receive(null, { master: 100, page: 25 });
  expect(media.volume).toBe(0.25);
  expect(sources).toBe(1);
  media.volume = 0.75;
  mutate();
  expect(media.volume).toBe(0.75);
  listeners.get("volumechange")!({ target: media });
  expect(sent).toContainEqual(["site-volume", 75]);
  media.isConnected = false;
  mutate();
  media.isConnected = true;
  mutate();
  expect(sources).toBe(1);
  expect(connections).toBe(2);
  receive(null, { master: 50, page: 75 });
  expect(gain.gain.value).toBe(0.5);
  expect(media.volume).toBe(0.75);
  receive(null, { master: 100, page: 100 });
  sent.length = 0;
  extra = { ...media, volume: 0, paused: true };
  mutate();
  expect(media.volume).toBe(1);
  expect(sent).not.toContainEqual(["site-volume", 0]);
  extra.volume = 0;
  listeners.get("volumechange")!({ target: extra });
  expect(media.volume).toBe(1);
  expect(sent).not.toContainEqual(["site-volume", 0]);
  // Old player remains connected but paused; equally sized replacement takes over.
  media.paused = true;
  extra = { ...media, paused: false, volume: 0.75 };
  mutate();
  receive(null, { master: 100, page: 25 });
  expect(extra.volume).toBe(0.25);
  sent.length = 0;
  extra.volume = 0.5;
  listeners.get("volumechange")!({ target: extra });
  expect(sent).toContainEqual(["site-volume", 50]);
  sent.length = 0;
  media.volume = 0.75;
  listeners.get("volumechange")!({ target: media });
  expect(sent).not.toContainEqual(["site-volume", 75]);
  // Explicit play transfers an equal-score source even while the previous player remains active.
  media.paused = false;
  listeners.get("play")!({ target: media });
  receive(null, { master: 100, page: 75 });
  expect(media.volume).toBe(0.75);
  expect(extra.volume).toBe(0.5);
});
