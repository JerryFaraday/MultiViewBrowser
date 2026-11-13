import { navyTokens } from "./ThemeTokens";
export type ThemeName = "dark" | "gray" | "black";
export const themePalettes = {
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
  if (c === "rgb(0, 135, 189)") return "#777777";
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
export function themeCSS(theme: ThemeName, overlay = false, feedback = false) {
  if (theme === "dark") return "";
  const p = themePalettes[theme];
  const vars = Object.entries(navyTokens)
    .map(([key, value]) => `--ui-${key.slice(4)}:${neutral(value, theme)}`)
    .join(";");
  return (
    `:root{${vars};color-scheme:dark}` +
    (overlay
      ? ""
      : `:root{background:${feedback ? "transparent" : p.background}}.settings-page-header{background:${p.title}}.settings-tabs{background:${p.title}}*{scrollbar-color:${p.border} ${p.background}}::-webkit-scrollbar-track{background:${p.background}}::-webkit-scrollbar-thumb{background:${p.border}}`)
  );
}
