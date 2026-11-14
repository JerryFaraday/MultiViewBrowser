import { mediaDocuments } from "./media-documents";
import { isLiveProfileLink } from "../src/core/NavigationPolicy";
import { ipcRenderer } from "electron";
import { installBilibiliLayoutCompatibility } from "./bilibili-layout";

function clickedLink(event: MouseEvent) {
  return event
    .composedPath()
    .find((node) => node instanceof HTMLAnchorElement) as
    HTMLAnchorElement | undefined;
}
document.addEventListener(
  "click",
  (event) => {
    if (event.button !== 0) return;
    const link = clickedLink(event);
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (!["http:", "https:"].includes(url.protocol)) return;
    if (event.isTrusted && isLiveProfileLink(location.href, url.href)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      ipcRenderer.send("open-profile-link", url.href);
      return;
    }
    // Do not navigate a script-driven placeholder before its site handler runs.
    if (
      location.hostname === "live.bilibili.com" &&
      link.target &&
      link.target !== "_self" &&
      (!link.getAttribute("href") || link.getAttribute("href")!.startsWith("#"))
    ) {
      event.preventDefault();
      return;
    }
    // Preserve ordinary in-page handlers; override browser new-tab modifiers/targets.
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      (link.target && link.target !== "_self")
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign(url.href);
    }
  },
  true,
);
document.addEventListener(
  "auxclick",
  (event) => {
    if (event.button !== 1 || !event.isTrusted) return;
    const link = clickedLink(event);
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (!["http:", "https:"].includes(url.protocol)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    ipcRenderer.send("open-middle-link", url.href);
  },
  true,
);

// Page level is an absolute HTML media volume; master gain is a separate stage.
let master = 1,
  page = 100,
  ready = false;
let context: AudioContext | undefined;
const routed = new WeakMap<HTMLMediaElement, GainNode>();
const sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
const active = new Set<HTMLMediaElement>();
const applied = new WeakMap<HTMLMediaElement, number>();
const expected = new WeakMap<HTMLMediaElement, number>();
let volumeSource: HTMLMediaElement | undefined;
const mediaScore = (media: HTMLMediaElement) => {
  const r = media.getBoundingClientRect?.();
  return (
    (media.tagName === "VIDEO" ? 1000000 : 0) +
    (r ? Math.max(0, r.width) * Math.max(0, r.height) : 0)
  );
};
const snap = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value / 25) * 25));
function publish(value: number) {
  page = value;
  ipcRenderer.send("site-volume", value);
}
const reported = new WeakMap<HTMLMediaElement, string>();
function report(media: HTMLMediaElement, data: object) {
  const json = JSON.stringify(data);
  if (reported.get(media) === json) return;
  reported.set(media, json);
  ipcRenderer.send("audio-status", data);
}
function apply(media: HTMLMediaElement) {
  if (!ready) return;
  if (
    media.isConnected &&
    media.readyState >= 2 &&
    !media.paused &&
    (!volumeSource?.isConnected ||
      volumeSource.paused ||
      volumeSource.ended ||
      mediaScore(media) > mediaScore(volumeSource))
  ) {
    volumeSource = media;
    applied.delete(media);
  }

  const desired = page / 100;
  if (media === volumeSource && applied.get(media) !== page) {
    expected.set(media, desired);
    applied.set(media, page);
    if (Math.abs(media.volume - desired) > 0.001) media.volume = desired;
  }
  let gain = routed.get(media);
  if (!gain && media.readyState >= 2 && !media.paused) {
    const src = media.currentSrc || media.getAttribute("src");
    if (src)
      try {
        const url = new URL(src, location.href);
        if (url.origin === location.origin || media.crossOrigin) {
          context ??= new AudioContext();
          const source = context.createMediaElementSource(media);
          sources.set(media, source);
          gain = context.createGain();
          source.connect(gain);
          gain.connect(context.destination);
          routed.set(media, gain);
          active.add(media);
          void context.resume().catch(() => {});
        }
      } catch (error) {
        report(media, {
          error: String(error),
          master,
          page,
          volume: media.volume,
        });
      }
  }
  if (gain) {
    if (!active.has(media)) {
      gain.connect(context!.destination);
      active.add(media);
    }
    gain.gain.value = master;
    if (context?.state === "suspended" && !media.paused)
      void context.resume().catch(() => {});
  }
  report(media, {
    master,
    page,
    volume: media.volume,
    gain: gain?.gain.value,
    context: context?.state,
  });
}
const watched = new WeakSet<Document>();
function watch(doc: Document) {
  if (watched.has(doc)) return;
  watched.add(doc);
  let lastInput = 0,
    lastScroll = 0;
  const interaction = (event: Event) => {
    if (!event.isTrusted) return;
    const mouse = event as MouseEvent,
      element = event.target as Element | null;
    const control = element?.closest?.("a")
      ? "link"
      : element?.matches?.("input,textarea,[contenteditable=true]")
        ? "input"
        : "other";
    if (event.type === "input") {
      if (Date.now() - lastInput < 200) return;
      lastInput = Date.now();
    }
    if (event.type === "scroll") {
      if (Date.now() - lastScroll < 500) return;
      lastScroll = Date.now();
    }
    const names: Record<string, string> = {
      pointerdown: mouse.button === 1 ? "web.middle_click" : "web.click",
      input: "web.input",
      keydown: "web.key",
      scroll: "web.scroll",
    };
    ipcRenderer.send("web-operation", names[event.type], {
      area: "page",
      control,
      status:
        event.type === "keydown"
          ? "input"
          : mouse.button === 1
            ? "middle"
            : mouse.button === 2
              ? "right"
              : event.type === "pointerdown"
                ? "left"
                : "other",
    });
  };
  for (const name of ["pointerdown", "input", "keydown", "scroll"])
    doc.addEventListener(name, interaction, true);
  new MutationObserver(scan).observe(doc, { childList: true, subtree: true });
  doc.addEventListener(
    "volumechange",
    (event) => {
      const media = event.target as HTMLMediaElement;
      if (
        !ready ||
        media !== volumeSource ||
        !media.isConnected ||
        typeof media.volume !== "number"
      )
        return;
      if (Math.abs(media.volume - (expected.get(media) ?? page / 100)) < 0.001)
        return;
      const value = snap(media.volume * 100);
      expected.set(media, value / 100);
      applied.delete(media);
      publish(value);
      scan();
    },
    true,
  );
  doc.addEventListener(
    "play",
    (event) => {
      const media = event.target as HTMLMediaElement;
      if (
        media.isConnected &&
        !media.paused &&
        media.readyState >= 2 &&
        media !== volumeSource &&
        (!volumeSource?.isConnected ||
          volumeSource.paused ||
          volumeSource.ended ||
          mediaScore(media) >= mediaScore(volumeSource))
      ) {
        volumeSource = media;
        applied.delete(media);
      }
      scan();
      void context?.resume().catch(() => {});
    },
    true,
  );
  doc.addEventListener(
    "pointerdown",
    () => void context?.resume().catch(() => {}),
    true,
  );
  doc.addEventListener("loadedmetadata", scan, true);
  doc.addEventListener("load", scan, true);
}
function scan() {
  for (const doc of mediaDocuments(document)) {
    watch(doc);
    doc
      .querySelectorAll("audio,video")
      .forEach((el) => apply(el as HTMLMediaElement));
  }
  for (const el of active)
    if (!el.isConnected) {
      routed.get(el)?.disconnect();
      active.delete(el);
    }
}
ipcRenderer.on(
  "audio-settings",
  (_event, settings: { master: number; page: number }) => {
    if (
      !settings ||
      !Number.isFinite(settings.master) ||
      !Number.isFinite(settings.page)
    )
      return;
    master = Math.max(0, Math.min(150, settings.master)) / 100;
    page = snap(settings.page);
    ready = true;
    scan();
  },
);
window.addEventListener("DOMContentLoaded", () => {
  installBilibiliLayoutCompatibility();
  scan();
});
// Diagnostic only: measure both sides of the master stage without recording audio.
ipcRenderer.on("audio-probe", async () => {
  const levels = [];
  for (const media of active) {
    const source = sources.get(media),
      gain = routed.get(media);
    if (!source || !gain || !context) continue;
    const input = context.createAnalyser(),
      output = context.createAnalyser();
    source.connect(input);
    gain.connect(output);
    let inEnergy = 0,
      outEnergy = 0;
    const a = new Float32Array(input.fftSize),
      b = new Float32Array(output.fftSize);
    for (let sample = 0; sample < 10; sample++) {
      await new Promise((r) => setTimeout(r, 25));
      input.getFloatTimeDomainData(a);
      output.getFloatTimeDomainData(b);
      for (let i = 0; i < a.length; i++) {
        inEnergy += a[i] * a[i];
        outEnergy += b[i] * b[i];
      }
    }
    source.disconnect(input);
    gain.disconnect(output);
    levels.push({
      page,
      master,
      inputRms: Math.sqrt(inEnergy / (a.length * 10)),
      outputRms: Math.sqrt(outEnergy / (a.length * 10)),
      ratio: inEnergy > 1e-10 ? Math.sqrt(outEnergy / inEnergy) : null,
      context: context.state,
    });
  }
  ipcRenderer.send("audio-probe-result", levels);
});
