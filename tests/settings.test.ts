import { it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultPreferences,
  newPageDefaults,
  allowPermission,
} from "../src/core/Preferences";
import { defaults } from "../src/core/WorkspaceManager";
import { configSchema, newPage } from "../src/core/model";
import { ConfigStore } from "../electron/storage";
import { openInEmptySlot } from "../src/core/SlotManager";
it("legacy configuration keeps old startup and page defaults", () => {
  const c: any = defaults();
  delete c.preferences;
  c.restore = false;
  expect(configSchema.parse(c).preferences.startupContent).toBe("blank");
  const p = defaultPreferences();
  expect(newPageDefaults(newPage("https://example.com"), p).scale).toEqual({
    mode: "auto",
    width: 1920,
    height: 1080,
    factor: 1,
  });
  expect(p.autoSaveSession).toBe(true);
  expect(p.theme).toBe("dark");
  expect(p.retryCount).toBe(0);
  expect(p.uiScale).toBe(1);
});
it("global defaults apply to new pages and leave existing pages untouched", () => {
  const c = defaults(),
    old = newPage("https://old.example");
  c.session.tree = {
    kind: "split",
    axis: "x",
    ratios: [0.5, 0.5],
    children: [
      { kind: "leaf", slot: 0 },
      { kind: "leaf", slot: 1 },
    ],
  };
  c.session.pages = [old];
  const p = {
    ...defaultPreferences(),
    resolution: "2160" as const,
    scaleMode: "responsive" as const,
    pageZoom: 1.25,
  };
  const next = openInEmptySlot(c.session, "https://new.example", p)!;
  expect(next.pages[0]).toBe(old);
  expect(next.pages[1]!.scale).toMatchObject({
    width: 3840,
    height: 2160,
    mode: "responsive",
  });
  expect(next.pages[1]!.pageZoom).toBe(1.25);
  expect(old.pageZoom).toBe(1);
});
it("disabling session autosave preserves disk session while preferences and manual workspaces still save", () => {
  const folder = mkdtempSync(join(tmpdir(), "mvb-settings-")),
    store = new ConfigStore(folder),
    c = defaults();
  c.session.pages = [newPage("https://saved.example")];
  store.save(c);
  const saved = store.load();
  saved.preferences.autoSaveSession = false;
  saved.session.pages = [newPage("https://runtime.example")];
  saved.workspaces.push({
    id: "manual",
    name: "saved",
    created: "",
    modified: "",
    snapshot: structuredClone(saved.session),
  });
  saved.bookmarksBar = true;
  store.save(saved);
  expect(store.load().session.pages[0]!.url).toContain("runtime.example");
  const restarted = new ConfigStore(folder).load();
  expect(restarted.session.pages[0]!.url).toContain("saved.example");
  expect(restarted.workspaces[0].snapshot.pages[0]!.url).toContain(
    "runtime.example",
  );
  expect(restarted.bookmarksBar).toBe(true);
  expect(
    JSON.parse(readFileSync(store.file, "utf8")).preferences.autoSaveSession,
  ).toBe(false);
  const enabled = store.load();
  enabled.preferences.autoSaveSession = true;
  store.save(enabled);
  expect(new ConfigStore(folder).load().session.pages[0]!.url).toContain(
    "runtime.example",
  );
});
it("permissions are origin-scoped and deny unknown, unconfigured and partial media access", () => {
  const p = defaultPreferences();
  expect(allowPermission(p, "https://example.com", "notifications")).toBe(
    false,
  );
  p.permissions = [
    {
      origin: "https://example.com",
      camera: true,
      microphone: false,
      notifications: true,
    },
  ];
  expect(allowPermission(p, "https://example.com", "media", ["video"])).toBe(
    true,
  );
  expect(
    allowPermission(p, "https://example.com", "media", ["video", "audio"]),
  ).toBe(false);
  expect(allowPermission(p, "https://sub.example.com", "notifications")).toBe(
    false,
  );
  expect(allowPermission(p, "https://example.com", "display-capture")).toBe(
    false,
  );
  expect(allowPermission(p, "https://example.com", "media", [])).toBe(false);
});
