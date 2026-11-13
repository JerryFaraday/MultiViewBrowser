import { it, expect } from "vitest";
import { themeCSS, themePalettes } from "../src/core/Theme";
import { preferencesSchema } from "../src/core/Preferences";
it("preserves navy and migrates legacy theme values", () => {
  expect(themeCSS("dark")).toBe("");
  expect(preferencesSchema.parse({}).theme).toBe("dark");
  expect(preferencesSchema.parse({ theme: "light" }).theme).toBe("dark");
  expect(preferencesSchema.parse({ theme: "gray" }).theme).toBe("gray");
});
it("new themes contain neutral colors without layout or zoom overrides", () => {
  for (const theme of ["gray", "black"] as const) {
    const css = themeCSS(theme);
    expect(css).toContain(themePalettes[theme].background);
    expect(css).not.toMatch(
      /(?:width|height|padding|zoom|transform|position):/,
    );
    expect(themeCSS(theme, true)).not.toContain("scrollbar");
    const colors = [...css.matchAll(/#([0-9a-f]{6})\b/gi)].map((x) => x[1]);
    expect(
      colors.every(
        (x) => x.slice(0, 2) === x.slice(2, 4) && x.slice(2, 4) === x.slice(4),
      ),
    ).toBe(true);
  }
});
