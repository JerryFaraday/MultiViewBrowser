export type BrowserShortcut =
  | "reload"
  | "reload-hard"
  | "back"
  | "forward"
  | "address"
  | "find"
  | "find-next"
  | "find-previous"
  | "zoom-in"
  | "zoom-out"
  | "zoom-reset"
  | "fullscreen"
  | "escape";
export function browserShortcut(input: {
  type: string;
  key: string;
  code?: string;
  control?: boolean;
  alt?: boolean;
  meta?: boolean;
  shift?: boolean;
  isComposing?: boolean;
}): BrowserShortcut | undefined {
  if (input.type !== "keyDown" || input.isComposing || input.meta) return;
  const key = input.key.toLowerCase();
  if (input.control && !input.alt) {
    if (key === "r" || key === "f5")
      return input.shift || key === "f5" ? "reload-hard" : "reload";
    if (key === "l" && !input.shift) return "address";
    if (key === "f" && !input.shift) return "find";
    if (key === "g") return input.shift ? "find-previous" : "find-next";
    if (["+", "="].includes(key) || input.code === "NumpadAdd")
      return "zoom-in";
    if (key === "-" || input.code === "NumpadSubtract") return "zoom-out";
    if (key === "0" || input.code === "Numpad0") return "zoom-reset";
    return;
  }
  if (input.alt && !input.control && !input.shift) {
    if (key === "arrowleft") return "back";
    if (key === "arrowright") return "forward";
    if (key === "d") return "address";
    return;
  }
  if (input.alt || input.control || input.shift) return;
  if (key === "f5") return "reload";
  if (key === "f11") return "fullscreen";
  if (key === "escape") return "escape";
}
