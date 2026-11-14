import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ source: "system", writes: 0, blink: "" }));
vi.mock("electron", () => ({
  app: {
    commandLine: {
      getSwitchValue: () => state.blink,
      appendSwitch: (_key: string, value: string) => {
        state.blink = value;
      },
    },
  },
  nativeTheme: {
    get themeSource() {
      return state.source;
    },
    set themeSource(value: string) {
      state.source = value;
      state.writes++;
    },
  },
}));
import {
  applyNativeTheme,
  initializeNativeScrollbars,
} from "../electron/NativeTheme";
beforeEach(() => {
  state.source = "system";
  state.writes = 0;
  state.blink = "";
});
it.each(["dark", "gray", "black"] as const)(
  "%s keeps Chromium dark without repeated updates",
  (theme) => {
    applyNativeTheme(theme);
    applyNativeTheme(theme);
    expect(state.source).toBe("dark");
    expect(state.writes).toBe(1);
  },
);
it("supports a future light preference and switching back to dark", () => {
  applyNativeTheme("light");
  expect(state.source).toBe("light");
  applyNativeTheme("gray");
  expect(state.source).toBe("dark");
  expect(state.writes).toBe(2);
});
it("preserves other Blink settings and replaces only the root scrollbar hint", () => {
  state.blink =
    "scrollAnimatorEnabled=true,preferredRootScrollbarColorScheme=1";
  initializeNativeScrollbars();
  initializeNativeScrollbars();
  expect(state.blink).toBe(
    "scrollAnimatorEnabled=true,preferredRootScrollbarColorScheme=0",
  );
});
