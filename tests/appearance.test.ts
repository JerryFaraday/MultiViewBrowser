import { expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  accentPresets,
  accentCSS,
  accentForeground,
  accentTokenRoles,
} from "../src/core/Accent";
import { preferencesSchema } from "../src/core/Preferences";
import { themeCSS, type ThemeName } from "../src/core/Theme";
import { defaults } from "../src/core/WorkspaceManager";
import { mergeConfig } from "../src/core/ConfigMerge";
import { ConfigStore } from "../electron/storage";

it("uses requested page-volume blue and preserves other accent presets", () => {
  expect(accentPresets).toEqual({
    blue: { name: "默认蓝色", color: "#29b6ff" },
    teal: { name: "青绿色", color: "#148c83" },
    violet: { name: "紫色", color: "#8070c7" },
  });
  for (const { color } of Object.values(accentPresets))
    expect(["#000000", "#ffffff"]).toContain(accentForeground(color));
});
it.each(["dark", "gray", "black", "light"] as ThemeName[])(
  "%s defaults to original blue and cannot override accent roles",
  (theme) => {
    expect(preferencesSchema.parse({ theme }).accentColor).toBe("blue");
    for (const key of Object.keys(accentTokenRoles))
      expect(themeCSS(theme)).not.toContain(`--ui-${key.slice(4)}:`);
    expect(accentCSS("blue")).toContain("--accent:#29b6ff");
  },
);
it("migrates legacy accent without losing light and gives explicit new fields priority", () => {
  const legacy = preferencesSchema.parse({ theme: "light", accent: "violet" });
  expect(legacy.theme).toBe("light");
  expect(legacy.accentColor).toBe("violet");
  expect(legacy).not.toHaveProperty("accent");
  expect(
    preferencesSchema.parse({ accent: "teal", accentColor: "blue" })
      .accentColor,
  ).toBe("blue");
});
it("keeps independently edited appearance fields through three-way merge", () => {
  const base = defaults(),
    draft = structuredClone(base),
    latest = structuredClone(base);
  draft.preferences.theme = "light";
  latest.preferences.accentColor = "teal";
  const merged = mergeConfig(base, draft, latest);
  expect(merged.preferences.theme).toBe("light");
  expect(merged.preferences.accentColor).toBe("teal");
});
it("loads legacy on-disk preferences and persists independent changes on restart", () => {
  const folder = mkdtempSync(join(tmpdir(), "mvb-appearance-"));
  const raw: any = defaults();
  delete raw.preferences.accentColor;
  raw.preferences.accent = "teal";
  raw.preferences.theme = "light";
  writeFileSync(join(folder, "config.json"), JSON.stringify(raw));
  const store = new ConfigStore(folder),
    c = store.load();
  expect(c.preferences.theme).toBe("light");
  expect(c.preferences.accentColor).toBe("teal");
  c.preferences.theme = "gray";
  store.save(c);
  const restarted = new ConfigStore(folder).load();
  expect(restarted.preferences.theme).toBe("gray");
  expect(restarted.preferences.accentColor).toBe("teal");
});
