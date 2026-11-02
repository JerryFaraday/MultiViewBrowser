import { it, expect } from "vitest";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { configSchema } from "../src/core/model";
import { defaults } from "../src/core/WorkspaceManager";

it("旧配置默认 100%，拒绝超过 150% 的配置", () => {
  const { masterVolume, ...legacy } = defaults();
  expect(configSchema.parse(legacy).masterVolume).toBe(100);
  expect(() => configSchema.parse({ ...legacy, masterVolume: 151 })).toThrow();
  expect(() => configSchema.parse({ ...legacy, masterVolume: -1 })).toThrow();
});

it("增益支持 150%，保持播放器音量，跨域回退不静音", () => {
  let receive: Function = () => {};
  const media = {
    readyState: 4,
    paused: false,
    currentSrc: "https://example.com/video",
    crossOrigin: null,
    volume: 1,
    isConnected: true,
  };
  const nodes: {
    gain: { value: number };
    connect: Function;
    disconnect: Function;
  }[] = [];
  class AudioContext {
    destination = {};
    createGain() {
      const node = { gain: { value: 1 }, connect() {}, disconnect() {} };
      nodes.push(node);
      return node;
    }
    createMediaElementSource() {
      return { connect() {} };
    }
    resume() {
      return Promise.resolve();
    }
  }
  const code = buildSync({
    entryPoints: ["electron/media-preload.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    write: false,
  }).outputFiles[0].text;
  runInNewContext(code, {
    require: () => ({
      ipcRenderer: {
        send() {},
        on: (name: string, fn: Function) => {
          if (name === "audio-settings") receive = fn;
        },
      },
    }),
    MutationObserver: class {
      observe() {}
    },
    AudioContext,
    URL,
    location: { href: "https://example.com", origin: "https://example.com" },
    window: { addEventListener() {} },
    document: {
      addEventListener() {},
      querySelectorAll: (selector: string) =>
        selector === "iframe" ? [] : [media],
    },
  });
  receive(null, { master: 150, page: 75 });
  expect(nodes[0].gain.value).toBe(1.5);
  expect(media.volume).toBe(0.75);
  receive(null, { master: 50, page: 25 });
  expect(nodes[0].gain.value).toBe(0.5);
  receive(null, { master: 0, page: 25 });
  expect(nodes[0].gain.value).toBe(0);
  const foreign = {
    ...media,
    currentSrc: "https://cdn.other.com/video",
    volume: 0.8,
  };
  const fallbackCode = code;
  runInNewContext(fallbackCode, {
    require: () => ({
      ipcRenderer: {
        send() {},
        on: (name: string, fn: Function) => {
          if (name === "audio-settings") receive = fn;
        },
      },
    }),
    MutationObserver: class {
      observe() {}
    },
    AudioContext,
    URL,
    location: { href: "https://example.com", origin: "https://example.com" },
    window: { addEventListener() {} },
    document: {
      addEventListener() {},
      querySelectorAll: (selector: string) =>
        selector === "iframe" ? [] : [foreign],
    },
  });
  receive(null, { master: 50, page: 25 });
  expect(foreign.volume).toBe(0.25);
  receive(null, { master: 150, page: 75 });
  expect(foreign.volume).toBe(0.75);
});
