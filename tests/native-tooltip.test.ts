import { it, expect } from "vitest";
import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { installNativeTooltipDismissal } from "../electron/native-tooltip";
function fixture() {
  const window = new EventEmitter(),
    wc = new EventEmitter(),
    sent: unknown[] = [];
  let destroyed = false;
  Object.assign(wc, {
    isDestroyed: () => destroyed,
    sendInputEvent: (event: unknown) => sent.push(event),
  });
  Object.assign(window, { webContents: wc, isDestroyed: () => destroyed });
  installNativeTooltipDismissal(window as unknown as BrowserWindow);
  return {
    window,
    wc,
    sent,
    destroy: () => {
      destroyed = true;
    },
  };
}
it("deactivation and Alt+Tab invalidate native hover without swallowing keyboard input", () => {
  const f = fixture();
  for (const event of ["blur", "hide", "minimize"]) f.window.emit(event);
  f.wc.emit("blur");
  const e = {
    preventDefault: () => {
      throw Error("shortcut intercepted");
    },
  };
  f.wc.emit("before-input-event", e, { type: "keyDown", key: "Alt" });
  f.wc.emit("before-input-event", e, {
    type: "keyDown",
    key: "Tab",
    alt: true,
  });
  expect(f.sent).toEqual(
    Array.from({ length: 6 }, () => ({ type: "mouseLeave", x: 0, y: 0 })),
  );
  f.wc.emit("before-input-event", e, { type: "keyDown", key: "a" });
  f.wc.emit("before-input-event", e, { type: "keyUp", key: "Alt" });
  expect(f.sent.length).toBe(6);
});
it("destroyed windows are ignored", () => {
  const f = fixture();
  f.destroy();
  f.window.emit("blur");
  expect(f.sent).toEqual([]);
});
