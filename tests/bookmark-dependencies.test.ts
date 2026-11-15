import { it, expect, vi } from "vitest";
import {
  bookmarkChildPreferences,
  bookmarkPreferenceDisabled,
} from "../src/core/Preferences";
import { defaults } from "../src/core/WorkspaceManager";
import { configSchema } from "../src/core/model";
import { ConfigStore } from "../electron/storage";
import { SettingSwitch } from "../src/components/SettingSwitch";
import { LiveCoordinator } from "../electron/live/LiveCoordinator";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
it.each(Array.from({ length: 8 }, (_, i) => i))(
  "preserves combination %i through hide, forged change, restart and show",
  (mask) => {
    const folder = mkdtempSync(join(tmpdir(), "mvb-dependent-")),
      store = new ConfigStore(folder),
      c = defaults();
    c.bookmarksBar = true;
    bookmarkChildPreferences.forEach(
      (key, i) => (c.preferences[key] = !!(mask & (1 << i))),
    );
    store.save(c);
    const hidden = store.load();
    hidden.bookmarksBar = false;
    store.accept(hidden);
    const loaded = new ConfigStore(folder).load();
    expect(loaded.bookmarksBar).toBe(false);
    for (const key of bookmarkChildPreferences) {
      expect(loaded.preferences[key]).toBe(c.preferences[key]);
      expect(bookmarkPreferenceDisabled(loaded, key)).toBe(true);
    }
    const forged = store.load();
    for (const key of bookmarkChildPreferences)
      forged.preferences[key] = !forged.preferences[key];
    const protectedConfig = store.accept(forged);
    for (const key of bookmarkChildPreferences)
      expect(protectedConfig.preferences[key]).toBe(c.preferences[key]);
    const shown = store.load();
    shown.bookmarksBar = true;
    const restored = store.accept(shown);
    for (const key of bookmarkChildPreferences) {
      expect(restored.preferences[key]).toBe(c.preferences[key]);
      expect(bookmarkPreferenceDisabled(restored, key)).toBe(false);
    }
  },
);
it("config parsing does not overwrite saved enabled detection while hidden", () => {
  const c = defaults();
  c.bookmarksBar = false;
  c.preferences.liveDetection = true;
  expect(configSchema.parse(c).preferences.liveDetection).toBe(true);
  expect(bookmarkPreferenceDisabled(c, "tooltips")).toBe(false);
});
it.each([false, true])(
  "disabled callbacks cannot change the original %s value",
  (checked) => {
    const changed = vi.fn(),
      control = SettingSwitch({
        checked,
        disabled: true,
        label: "fixture",
        onChange: changed,
      });
    expect(control.props.disabled).toBe(true);
    expect(control.props["aria-checked"]).toBe(checked);
    control.props.onClick();
    expect(changed).not.toHaveBeenCalled();
    SettingSwitch({
      checked,
      label: "fixture",
      onChange: changed,
    }).props.onClick();
    expect(changed).toHaveBeenCalledWith(!checked);
  },
);
it("saved detection preference does not run either platform while parent is off", async () => {
  const bili = vi.fn(),
    douyu = vi.fn(),
    c = defaults();
  c.bookmarksBar = false;
  c.preferences.liveDetection = true;
  c.favorites = [
    {
      id: "a",
      name: "fixture",
      group: "常用",
      category: "douyu-live",
      roomId: "6657",
      url: "https://www.douyu.com/6657",
      liveCache: null,
      note: "",
      created: "",
    },
  ];
  c.favorites.push({
    ...c.favorites[0],
    id: "b",
    category: "bilibili-live",
    roomId: "35",
    url: "https://live.bilibili.com/35",
  });
  const m = new LiveCoordinator(bili, douyu, () => {});
  m.configure(c);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(bili).not.toHaveBeenCalled();
  expect(douyu).not.toHaveBeenCalled();
  expect(m.states).toEqual({});
  m.dispose();
});
