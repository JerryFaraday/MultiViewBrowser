import { beforeEach, expect, it, vi } from "vitest";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
const native = vi.hoisted(() => ({
  cursor: { x: 0, y: 0 },
  active: undefined as any,
  handlers: new Map<string, any>(),
  windows: [] as any[],
}));
vi.mock("electron", () => {
  class Window {
    visible = true;
    minimized = false;
    destroyed = false;
    parent?: Window;
    events = new Map<string, (() => void)[]>();
    webContents = {
      mainFrame: {},
      send: vi.fn(),
      setZoomMode: vi.fn(),
      setZoomFactor: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
    };
    constructor(public options: any = {}) {
      this.parent = options.parent;
      this.visible = options.show !== false;
      native.windows.push(this);
    }
    static getFocusedWindow() {
      return native.active;
    }
    on(event: string, fn: () => void) {
      this.events.set(event, [...(this.events.get(event) ?? []), fn]);
      return this;
    }
    emit(event: string) {
      this.events.get(event)?.forEach((fn) => fn());
    }
    isDestroyed() {
      return this.destroyed;
    }
    isVisible() {
      return this.visible;
    }
    isMinimized() {
      return this.minimized;
    }
    isFocused() {
      return native.active === this;
    }
    getParentWindow() {
      return this.parent;
    }
    getContentBounds() {
      return { x: -1600, y: 80, width: 1400, height: 900 };
    }
    setMenu() {}
    loadFile() {
      return Promise.resolve();
    }
    loadURL() {
      return Promise.resolve();
    }
    setBounds() {}
    showInactive() {
      this.visible = true;
    }
    hide() {
      this.visible = false;
    }
  }
  return {
    BrowserWindow: Window,
    WebContentsView: Window,
    ipcMain: {
      handle: (name: string, fn: any) => native.handlers.set(name, fn),
    },
    screen: {
      getCursorScreenPoint: () => native.cursor,
      getDisplayNearestPoint: () => ({
        workArea: { x: -1800, y: 0, width: 1800, height: 1000 },
      }),
      getDisplayMatching: () => ({
        workArea: { x: -1800, y: 0, width: 1800, height: 1000 },
      }),
    },
  };
});
import { BrowserWindow } from "electron";
import { ScalePopup } from "../electron/ScalePopup";
import { PageStash } from "../electron/PageStash";
beforeEach(() => {
  native.handlers.clear();
  native.windows.length = 0;
  native.active = undefined;
});
for (const kind of ["scale", "stash"] as const) {
  const setup = () => {
    const parent = new BrowserWindow(),
      config = defaults(),
      page = newPage("https://example.test");
    config.session.pages = [page];
    config.masterMuted = true;
    const popup =
      kind === "scale"
        ? new ScalePopup(parent, vi.fn())
        : new PageStash(
            parent,
            () => config,
            vi.fn(),
            () => true,
            vi.fn(),
            vi.fn(),
            vi.fn(),
          );
    native.active = parent;
    native.cursor = { x: -1480, y: 140 };
    const rect = { x: 100, y: 40, width: 40, height: 30 };
    const show = () =>
      popup instanceof ScalePopup
        ? popup.show(page.id, rect, config, false)
        : popup.show(rect);
    const visible = () =>
      native.windows.some(
        (w) => w.options.webPreferences?.preload && w.visible,
      );
    return { parent: parent as any, popup, show, visible };
  };
  it(`${kind}: real pointer over active owner opens normally`, async () => {
    const t = setup();
    await t.show();
    expect(t.visible()).toBe(true);
  });
  it(`${kind}: taskbar pointer cannot open from stale enter event`, async () => {
    const t = setup();
    native.cursor = { x: -900, y: 980 };
    await t.show();
    expect(t.visible()).toBe(false);
  });
  it(`${kind}: inactive owner cannot open even at matching coordinates`, async () => {
    const t = setup();
    native.active = undefined;
    await t.show();
    expect(t.visible()).toBe(false);
  });
  it(`${kind}: minimized or hidden owner cannot open`, async () => {
    const t = setup();
    t.parent.minimized = true;
    await t.show();
    expect(t.visible()).toBe(false);
    t.parent.minimized = false;
    t.parent.visible = false;
    await t.show();
    expect(t.visible()).toBe(false);
  });
  it(`${kind}: pointer must still match after asynchronous first load`, async () => {
    const t = setup();
    const showing = t.show();
    native.cursor = { x: -900, y: 980 };
    await showing;
    expect(t.visible()).toBe(false);
  });
  it(`${kind}: loss of activation during first load cancels open`, async () => {
    const t = setup();
    const showing = t.show();
    native.active = undefined;
    await showing;
    expect(t.visible()).toBe(false);
  });
  it(`${kind}: focused owned popup permits normal movement between buttons`, async () => {
    const t = setup();
    native.active = new BrowserWindow({ parent: t.parent });
    await t.show();
    expect(t.visible()).toBe(true);
  });
  it(`${kind}: inactive application immediately dismisses a never-focused popup`, async () => {
    const t = setup();
    await t.show();
    native.active = undefined;
    t.parent.emit("blur");
    expect(t.visible()).toBe(false);
    native.active = t.parent;
    t.parent.emit("focus");
    expect(t.visible()).toBe(false);
  });
  it(`${kind}: focusing popup controls preserves it; leaving the app dismisses it`, async () => {
    const t = setup();
    await t.show();
    const panel = native.windows.find((w) => w.options.webPreferences?.preload);
    native.active = panel;
    t.parent.emit("blur");
    expect(t.visible()).toBe(true);
    native.active = undefined;
    panel.emit("blur");
    expect(t.visible()).toBe(false);
  });
}
