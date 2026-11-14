import { navyTokens } from "./ThemeTokens";

export const accentPresets = {
  blue: { name: "默认蓝色", color: navyTokens.tone57 },
  teal: { name: "青绿色", color: "#148c83" },
  violet: { name: "紫色", color: "#8070c7" },
} as const;
export type AccentName = keyof typeof accentPresets;
export const accentNames = Object.keys(accentPresets) as AccentName[];

/** Semantic accent roles shared by all application themes and local popups. */
export const accentTokenRoles = {
  tone9: "accent",
  tone10: "accent",
  tone14: "accent",
  tone17: "accent",
  tone21: "accent",
  tone22: "accent-soft",
  tone28: "accent",
  tone29: "accent-soft",
  tone32: "accent",
  tone33: "accent",
  tone34: "accent",
  tone37: "accent",
  tone54: "accent",
  tone55: "accent",
  tone56: "accent-soft",
  tone57: "accent",
  tone58: "accent-soft",
  tone59: "accent",
  tone60: "accent-soft",
  tone65: "accent",
  tone66: "accent-on",
  tone71: "accent",
  tone72: "accent",
} as const;

function components(color: string) {
  return color.startsWith("#")
    ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
    : color.match(/\d+/g)!.map(Number);
}
export function accentForeground(color: string) {
  const [r, g, b] = components(color).map((v) => {
    const n = v / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
    ? "#000000"
    : "#ffffff";
}
export function accentCSS(name: AccentName, overlay = false) {
  const color = accentPresets[name].color;
  const aliases = Object.entries(accentTokenRoles)
    .map(([key, role]) => `--ui-${key.slice(4)}:var(--${role})`)
    .join(";");
  const vars = `:root{--accent:${color};--accent-on:${accentForeground(color)};--accent-soft:rgba(${components(color).join(",")},0.16);${aliases}}`;
  return (
    vars +
    (overlay
      ? ""
      : `
    input[type=range],input[type=checkbox],input[type=radio]{accent-color:var(--accent)}
    .primary,.primary:hover{background:var(--accent);border-color:var(--accent);color:var(--accent-on)}
    .primary:hover{border-color:var(--accent-on)}
    .setting-switch[aria-checked=true] span{background:var(--accent-on)}
    :is(button,input,select,textarea):focus-visible{outline:2px solid var(--accent);outline-offset:2px;box-shadow:0 0 0 2px var(--focus-contrast,transparent)}
  `)
  );
}
