// Audit reproducer, intentionally reports current faults rather than locking them into unit tests.
import { buildSync } from "esbuild";
import { runInNewContext } from "node:vm";
import { writeFileSync } from "node:fs";
const code = buildSync({
  entryPoints: ["electron/media-preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  write: false,
}).outputFiles[0].text;
let receive = () => {},
  scan = () => {},
  loaded = () => {};
const listeners = new Map(),
  sent = [];
const old = {
  readyState: 4,
  paused: false,
  currentSrc: "https://example.com/a",
  volume: 1,
  crossOrigin: null,
  isConnected: true,
  tagName: "VIDEO",
  getBoundingClientRect: () => ({ width: 640, height: 360 }),
};
const next = { ...old, currentSrc: "https://example.com/b", volume: 0.75 };
let elements = [old];
class AudioContext {
  state = "running";
  destination = {};
  createMediaElementSource() {
    return { connect() {} };
  }
  createGain() {
    return { gain: { value: 1 }, connect() {}, disconnect() {} };
  }
  resume() {
    return Promise.resolve();
  }
}
class MutationObserver {
  constructor(fn) {
    scan = fn;
  }
  observe() {}
}
runInNewContext(code, {
  require: () => ({
    ipcRenderer: {
      on: (name, fn) => {
        if (name === "audio-settings") receive = fn;
      },
      send: (...args) => sent.push(args),
    },
  }),
  AudioContext,
  MutationObserver,
  URL,
  location: { href: "https://example.com", origin: "https://example.com" },
  window: { addEventListener: (_name, fn) => (loaded = fn) },
  document: {
    addEventListener: (name, fn) => listeners.set(name, fn),
    querySelectorAll: (selector) => (selector === "iframe" ? [] : elements),
  },
});
loaded();
receive(null, { master: 100, page: 100 });
old.paused = true;
elements = [old, next];
scan();
receive(null, { master: 100, page: 25 });
const afterCommand = { oldVolume: old.volume, newVolume: next.volume };
sent.length = 0;
next.volume = 0.5;
listeners.get("volumechange")({ target: next });
const result = {
  afterCommand,
  newPlayerChangeReported: sent.some((e) => e[0] === "site-volume"),
  defectReproduced:
    afterCommand.oldVolume === 0.25 &&
    afterCommand.newVolume === 0.75 &&
    !sent.some((e) => e[0] === "site-volume"),
};
writeFileSync("review-media-results.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
