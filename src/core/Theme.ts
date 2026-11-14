import { navyTokens } from "./ThemeTokens";
import { accentTokenRoles } from "./Accent";
export type ThemeName = "dark" | "gray" | "black" | "light";
export const themePalettes = {
  dark: {
    background: "#10141d",
    title: "#1a2231",
    toolbar: "#19202e",
    control: "#222b3d",
    hover: "#34425d",
    border: "#344058",
    text: "#dce3f1",
    secondary: "#a1aec5",
  },
  light: {
    background: "#f3f6fb",
    title: "#e8eef6",
    toolbar: "#e8eef6",
    control: "#e2eaf5",
    hover: "#cedbef",
    border: "#b9c8dc",
    text: "#243247",
    secondary: "#56667c",
  },
  gray: {
    background: "#1e1e1e",
    title: "#242424",
    toolbar: "#2b2b2b",
    control: "#333333",
    hover: "#404040",
    border: "#424242",
    text: "#ededed",
    secondary: "#aaaaaa",
  },
  black: {
    background: "#000000",
    title: "#101010",
    toolbar: "#111111",
    control: "#1c1c1c",
    hover: "#292929",
    border: "#303030",
    text: "#ffffff",
    secondary: "#aaaaaa",
  },
};
function neutral(original: string, theme: "gray" | "black") {
  const p = themePalettes[theme],
    c = original.toLowerCase();
  if (["#10141d", "#1a2231"].includes(c)) return p.background;
  if (["#19202e", "#192231"].includes(c)) return p.toolbar;
  if (["#222b3d", "#151a23", "#111724", "#111a26"].includes(c))
    return p.control;
  if (c === "#242424") return p.title;
  if (["#34425d", "#38404b", "#293449", "#30415b"].includes(c)) return p.hover;
  if (["#344058", "#3b4966", "#444", "#555", "#303b52"].includes(c))
    return p.border;
  if (["#aaa", "#aaaaaa", "#a1aec5"].includes(c)) return p.secondary;
  let rgb: number[],
    alpha = 1;
  if (c === "white") rgb = [255, 255, 255];
  else if (c.startsWith("#")) {
    let hex = c.slice(1);
    if (hex.length <= 4) hex = [...hex].map((x) => x + x).join("");
    rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    if (hex.length === 8) alpha = parseInt(hex.slice(6), 16) / 255;
  } else {
    const values = c.match(/[\d.]+/g)!.map(Number);
    rgb = values.slice(0, 3);
    alpha = values[3] ?? 1;
  }
  if (alpha < 1 && rgb.every((v) => v === 0)) return `rgba(0,0,0,${alpha})`;
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  const value =
    luminance > 180
      ? theme === "black"
        ? 255
        : 237
      : luminance > 105
        ? 170
        : luminance > 65
          ? 112
          : luminance > 40
            ? theme === "black"
              ? 48
              : 66
            : luminance > 20
              ? theme === "black"
                ? 28
                : 43
              : theme === "black"
                ? 0
                : 30;
  return alpha === 1
    ? "#" + value.toString(16).padStart(2, "0").repeat(3)
    : `rgba(${value},${value},${value},${alpha})`;
}
function lightToken(key: string) {
  const n = Number(key.slice(4)),
    p = themePalettes.light;
  if ([1, 53].includes(n)) return p.background;
  if ([11, 18, 38, 49, 51, 73].includes(n)) return p.title;
  if ([2, 29, 31, 46, 56, 58, 60, 68].includes(n)) return p.control;
  if ([7, 44, 76].includes(n)) return "#fbfdff";
  if ([5, 26, 64, 81, 83].includes(n)) return p.hover;
  if ([3, 12, 15, 19, 34, 48, 52, 61, 62, 69, 75, 78].includes(n))
    return p.border;
  if ([13, 16, 25, 30, 36, 41, 42, 45, 63, 67, 79, 82].includes(n))
    return p.secondary;
  if (n === 20) return navyTokens.tone20;
  if (n === 50) return "#32445a66";
  if (n === 80) return navyTokens.tone80;
  if (n === 23) return "#b9c8dc";
  if (n === 39) return "#c9d9ed";
  if (n === 40) return "#253c5a";
  if (n === 4) return "#26364a";
  if (n === 6) return "#17283f";
  return p.text;
}
export function themeCSS(
  theme: ThemeName,
  overlay = false,
  feedback = false,
  popup = false,
) {
  const p = themePalettes[theme];
  const vars = Object.entries(navyTokens)
    .filter(([key]) => !(key in accentTokenRoles))
    .map(
      ([key, value]) =>
        `--ui-${key.slice(4)}:${theme === "dark" ? value : theme === "light" ? lightToken(key) : neutral(value, theme)}`,
    )
    .join(";");
  return (
    `:root{${vars};--app-color-scheme:${theme === "light" ? "light" : "dark"};color-scheme:var(--app-color-scheme);--audible-ink:var(--${theme === "light" ? "accent-on" : "accent"});--audible-surface:var(--${theme === "light" ? "accent" : "accent-soft"});--accent-label-ink:var(--${theme === "light" ? "accent-on" : "accent"});--accent-label-surface:${theme === "light" ? "var(--accent)" : "transparent"};--focus-contrast:${theme === "light" ? "var(--ui-0)" : "transparent"}}` +
    (overlay
      ? ""
      : `:root{background:${feedback ? "transparent" : popup ? (theme === "dark" ? navyTokens.tone73 : p.title) : p.background}}.settings-page-header{background:${p.title}}.settings-tabs{background:${p.title}}*{scrollbar-color:${theme === "dark" || theme === "light" ? "auto" : p.border + " " + p.background}}`)
  );
}
