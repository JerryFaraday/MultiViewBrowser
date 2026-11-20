import { it, expect } from "vitest";
import { browserShortcut } from "../src/core/Shortcuts";
it("maps explicit browser commands", () => {
  for (const [key, control, shift, alt, expected] of [
    ["F5", false, false, false, "reload"],
    ["r", true, false, false, "reload"],
    ["r", true, true, false, "reload-hard"],
    ["F5", true, false, false, "reload-hard"],
    ["ArrowLeft", false, false, true, "back"],
    ["ArrowRight", false, false, true, "forward"],
    ["l", true, false, false, "address"],
    ["d", false, false, true, "address"],
    ["f", true, false, false, "find"],
    ["g", true, true, false, "find-previous"],
    ["g", true, false, false, "find-next"],
    ["+", true, true, false, "zoom-in"],
    ["-", true, false, false, "zoom-out"],
    ["0", true, false, false, "zoom-reset"],
    ["F11", false, false, false, "fullscreen"],
  ] as const)
    expect(browserShortcut({ type: "keyDown", key, control, shift, alt })).toBe(
      expected,
    );
});
it("preserves editing, IME, site keys and undecided lifecycle combinations", () => {
  for (const key of ["c", "v", "x", "a", "z", "t", "w", "Tab"])
    expect(
      browserShortcut({ type: "keyDown", key, control: true }),
    ).toBeUndefined();
  expect(
    browserShortcut({
      type: "keyDown",
      key: "f",
      control: true,
      isComposing: true,
    }),
  ).toBeUndefined();
  expect(browserShortcut({ type: "keyUp", key: "F5" })).toBeUndefined();
  expect(browserShortcut({ type: "keyDown", key: " " })).toBeUndefined();
});
