import { it, expect, vi, beforeEach } from "vitest";
import type { BrowserWindow } from "electron";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
const state = vi.hoisted(() => ({
  created: 0,
  shown: 0,
  ready: () => {},
  active: undefined as unknown,
}));
vi.mock("electron", () => ({
  ipcMain: { handle() {} },
  BrowserWindow: class {
    static getFocusedWindow() {
      return state.active;
    }
    webContents = { setWindowOpenHandler() {}, on() {}, send() {} };
    constructor() {
      state.created++;
    }
    setMenu() {}
    on() {}
    setBounds() {}
    hide() {}
    destroy() {}
    isDestroyed() {
      return false;
    }
    showInactive() {
      state.shown++;
    }
    loadFile() {
      return new Promise<void>((resolve) => {
        state.ready = resolve;
      });
    }
  },
  screen: { getCursorScreenPoint: () => ({ x: 10, y: 10 }) },
}));
import { VolumePopup } from "../electron/VolumePopup";
import { ScalePopup } from "../electron/ScalePopup";
const popups = [
  ["音量", VolumePopup],
  ["缩放", ScalePopup],
] as const;
const parent = {
  on() {},
  isDestroyed: () => false,
  isVisible: () => true,
  isMinimized: () => false,
  getContentBounds: () => ({ x: 0, y: 0 }),
} as unknown as BrowserWindow;
beforeEach(() => {
  state.active = parent;
  state.created = 0;
  state.shown = 0;
});
it.each(popups)(
  "%s 空会话启动和无效显示请求都不创建浮层原生窗口",
  async (_name, Popup) => {
    const popup = new Popup(parent, () => {});
    popup.update(defaults());
    await popup.show(
      "missing",
      { x: 0, y: 0, width: 34, height: 34 },
      defaults(),
      false,
    );
    expect(state.created).toBe(0);
    expect(state.shown).toBe(0);
  },
);
it.each(popups)(
  "%s 浮层加载期间失效的显示请求不能在加载完成后重新弹出",
  async (_name, Popup) => {
    const config = defaults();
    config.session.pages = [newPage("https://example.com")];
    const popup = new Popup(parent, () => {});
    const showing = popup.show(
      config.session.pages[0]!.id,
      { x: 0, y: 0, width: 34, height: 34 },
      config,
      false,
    );
    expect(state.created).toBe(1);
    expect(state.shown).toBe(0);
    popup.hide();
    state.ready();
    await showing;
    expect(state.shown).toBe(0);
  },
);
