import { app, nativeTheme } from "electron";
import type { ThemeName } from "../src/core/Theme";

/** Electron 45 omits Chrome's root scrollbar preference. Blink's dark hint
 * (PreferredColorScheme::kDark = 0) is used only with a dark content preference
 * and color-scheme:normal; explicit author schemes/styles still win.
 * Set before renderer creation, preserving unrelated Blink settings.
 */
export function initializeNativeScrollbars() {
  const settings = app.commandLine
    .getSwitchValue("blink-settings")
    .split(",")
    .filter(
      (value) =>
        value && !value.startsWith("preferredRootScrollbarColorScheme="),
    );
  app.commandLine.appendSwitch(
    "blink-settings",
    [...settings, "preferredRootScrollbarColorScheme=0"].join(","),
  );
}

/** Theme preference only; never opt a website into a different color scheme. */
export function applyNativeTheme(theme: ThemeName | "light") {
  const source = theme === "light" ? "light" : "dark";
  if (nativeTheme.themeSource !== source) nativeTheme.themeSource = source;
}
