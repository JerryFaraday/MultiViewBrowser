import { it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../electron/storage";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
import { swapPages, setPageVolume, isMuted } from "../src/core/AudioManager";
it("A01 stale saves preserve authoritative volume, exchange, zoom and workspace while retaining independent edits", () => {
  const store = new ConfigStore(mkdtempSync(join(tmpdir(), "mvb-race-")));
  const initial = defaults();
  initial.session.pages = [
    newPage("https://a.example"),
    newPage("https://b.example"),
    null,
  ];
  store.save(initial);
  const stale = store.load();
  const latest = store.load();
  latest.session.pages = swapPages(latest.session.pages, 0, 1);
  latest.session.pages[0]!.pageZoom = 1.5;
  latest.session.pages[0]!.volume = 25;
  latest.workspaces.push({
    id: "saved",
    name: "保存",
    created: "",
    modified: "",
    snapshot: structuredClone(latest.session),
  });
  store.save(latest);
  stale.bookmarksBar = true;
  const merged = store.accept(stale);
  expect(merged.session).toEqual(latest.session);
  expect(merged.workspaces).toEqual(latest.workspaces);
  expect(merged.bookmarksBar).toBe(true);
  const restored = store.load().workspaces[0].snapshot;
  expect(restored.pages[0]!.pageZoom).toBe(1.5);
  expect(isMuted(restored.pages[1]!, 1)).toBe(true);
});
it("A01 closed pages are never resurrected or shifted by stale edits", () => {
  const store = new ConfigStore(mkdtempSync(join(tmpdir(), "mvb-close-")));
  const initial = defaults();
  initial.session.pages = [
    newPage("https://a.example"),
    newPage("https://b.example"),
  ];
  store.save(initial);
  const stale = store.load(),
    latest = store.load();
  latest.session.pages[0] = null;
  store.save(latest);
  stale.session.pages[0]!.volume = 25;
  expect(store.accept(stale).session.pages).toEqual(latest.session.pages);
});
it("A03 site sync preserves explicit mute and automatic secondary mute; user action can unmute", () => {
  for (const audio of ["muted", "auto", "unmuted"] as const) {
    const page = newPage("https://a.example");
    page.audio = audio;
    setPageVolume(page, 75, false);
    expect(page.audio).toBe(audio);
    expect(isMuted(page, 1)).toBe(audio !== "unmuted");
    setPageVolume(page, 25, true);
    expect(isMuted(page, 1)).toBe(false);
  }
});

it("A01 stale local page edits follow page identity after a concurrent exchange", () => {
  const store = new ConfigStore(mkdtempSync(join(tmpdir(), "mvb-follow-")));
  const initial = defaults();
  initial.session.pages = [
    newPage("https://a.example"),
    newPage("https://b.example"),
  ];
  store.save(initial);
  const local = store.load(),
    remote = store.load();
  local.session.pages[0]!.pageZoom = 1.75;
  remote.session.pages = swapPages(remote.session.pages, 0, 1);
  store.save(remote);
  const merged = store.accept(local);
  expect(merged.session.pages[1]!.id).toBe(local.session.pages[0]!.id);
  expect(merged.session.pages[1]!.pageZoom).toBe(1.75);
  expect(isMuted(merged.session.pages[1]!, 1)).toBe(true);
});
it("A01 unavailable base revisions fail closed instead of overwriting current state", () => {
  const store = new ConfigStore(mkdtempSync(join(tmpdir(), "mvb-expired-")));
  const current = defaults();
  store.save(current);
  const unknown = structuredClone(current);
  unknown.revision = 999999;
  expect(() => store.accept(unknown)).toThrow("配置版本已过期");
  expect(store.load()).toEqual(current);
});
