import { app, BrowserWindow } from "electron";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { defaults } from "../src/core/WorkspaceManager";
app.setPath("userData", process.env.MVB_DEPENDENCY_PROFILE!);
if (!existsSync(app.getPath("userData") + "/config.json")) {
  const c = defaults();
  c.bookmarksBar = true;
  c.favorites = [];
  c.preferences.startupWindow = "normal";
  c.preferences.startupContent = "blank";
  c.masterMuted = true;
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(app.getPath("userData") + "/config.json", JSON.stringify(c));
}
const labels = ["显示收藏分组名称", "显示收藏栏分组", "检测直播间开播状态"],
  keys = ["showGroupNames", "showBookmarkGroups", "liveDetection"];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
void import("./main");
app.whenReady().then(async () => {
  let stage = "startup";
  const deadline = setTimeout(() => app.exit(2), 100000);
  try {
    await wait(1000);
    const w = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getTitle() === "MultiView Browser",
      )!,
      root = w.webContents;
    w.unmaximize();
    w.setSize(1280, 850);
    root.setBackgroundThrottling(false);
    const js = (s: string) => root.executeJavaScript(s);
    const load = () => js("window.browser.load()");
    const enter = async () => {
      await js(
        "Array.from(document.querySelectorAll('.toolbar>button')).find(b=>b.textContent==='设置').click()",
      );
      await wait(30);
      await js(
        "Array.from(document.querySelectorAll('.settings-tabs button')).find(b=>b.textContent==='收藏栏').click()",
      );
      await wait(30);
    };
    const states = () =>
      js(
        `(${JSON.stringify(labels)}).map(n=>{const e=document.querySelector('[aria-label="'+n+'"]'),s=getComputedStyle(e),k=getComputedStyle(e.firstElementChild),r=e.getBoundingClientRect(),row=e.closest('.setting-row'),rr=row.getBoundingClientRect(),text=getComputedStyle(row.firstElementChild),desc=getComputedStyle(row.querySelector('small'));return {checked:e.getAttribute('aria-checked'),disabled:e.disabled,bg:s.backgroundColor,opacity:s.opacity,cursor:s.cursor,overlay:getComputedStyle(e,'::after').backgroundColor,overlayContent:getComputedStyle(e,'::after').content,knob:k.left,width:r.width,height:r.height,rowHeight:rr.height,text:text.color,desc:desc.color}})`,
      );
    const clickParent = async () => {
      await js("document.querySelector('[aria-label=\"显示收藏栏\"]').click()");
      await wait(260);
    };
    const sameValues = async (values: boolean[]) => {
      const c = await load();
      return keys.every((k, i) => c.preferences[k] === values[i]);
    };
    await enter();
    if (process.argv.includes("--restart")) {
      const before = await states();
      const pass =
        !(await load()).bookmarksBar &&
        (await sameValues([true, false, true])) &&
        before.every(
          (x: any, i: number) =>
            x.disabled && x.checked === String([true, false, true][i]),
        );
      await clickParent();
      const after = await states();
      console.log(
        JSON.stringify({
          restart: pass,
          restored: after.every(
            (x: any, i: number) =>
              !x.disabled && x.checked === String([true, false, true][i]),
          ),
        }),
      );
      app.exit(pass && after.every((x: any) => !x.disabled) ? 0 : 1);
      return;
    }
    let all = true,
      cases = 0;
    const errors: string[] = [];
    for (const theme of ["dark", "gray", "black", "light"]) {
      for (let mask = 0; mask < 8; mask++) {
        stage = theme + ":" + mask;
        const values = keys.map((_, i) => !!(mask & (1 << i)));
        await js(
          `window.browser.load().then(c=>{c.bookmarksBar=true;c.preferences.theme=${JSON.stringify(theme)};${keys.map((k, i) => `c.preferences.${k}=${values[i]}`).join(";")};return window.browser.save(c)})`,
        );
        root.reload();
        await wait(270);
        await enter();
        const before = await states();
        await clickParent();
        const disabled = await states();
        let pass =
          (await sameValues(values)) &&
          disabled.every(
            (s: any, i: number) =>
              s.disabled &&
              s.checked === String(values[i]) &&
              s.knob === before[i].knob &&
              s.bg === before[i].bg &&
              s.width === before[i].width &&
              s.height === before[i].height &&
              s.rowHeight === before[i].rowHeight &&
              s.opacity === "1" &&
              s.cursor === "default" &&
              s.overlayContent === '""' &&
              s.overlay.includes("0.38") &&
              s.text === s.desc,
          );
        await js(
          `(${JSON.stringify(labels)}).forEach(n=>{const e=document.querySelector('[aria-label="'+n+'"]');e.click();e.dispatchEvent(new MouseEvent('click',{bubbles:true}));e.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));e.closest('label').click();e.focus();})`,
        );
        pass =
          pass &&
          (await sameValues(values)) &&
          (await js(
            `!(${JSON.stringify(labels)}).includes(document.activeElement.getAttribute('aria-label'))`,
          ));
        await js(
          `window.browser.load().then(c=>{${keys.map((k) => `c.preferences.${k}=!c.preferences.${k}`).join(";")};return window.browser.save(c)})`,
        );
        pass = pass && (await sameValues(values));
        if (mask === 5) {
          root.debugger.attach("1.3");
          const point = await js(
            "(()=>{const r=document.querySelector('[aria-label=\"显示收藏分组名称\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
          );
          await root.debugger.sendCommand("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            ...point,
          });
          await root.debugger.sendCommand("Input.dispatchMouseEvent", {
            type: "mousePressed",
            ...point,
            button: "left",
            clickCount: 1,
          });
          await root.debugger.sendCommand("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            ...point,
            button: "left",
            clickCount: 1,
          });
          const hovered = await states();
          pass =
            pass &&
            (await sameValues(values)) &&
            hovered.every(
              (s: any, i: number) =>
                s.bg === disabled[i].bg && s.cursor === "default",
            );
          await root.debugger.sendCommand("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x: 1,
            y: 1,
          });
          root.debugger.detach();
          await js(
            "document.querySelector('[aria-label=\"显示收藏栏\"]').focus()",
          );
          root.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
          root.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
          await wait(20);
          pass =
            pass &&
            (await js(
              `!(${JSON.stringify(labels)}).includes(document.activeElement.getAttribute('aria-label'))`,
            ));
        }
        if (mask === 5) {
          const bounds = await js(
            "(()=>{const r=document.querySelector('.settings-content-inner').getBoundingClientRect();return {x:Math.ceil(r.x),y:Math.ceil(r.y),width:Math.ceil(r.width),height:420}})()",
          );
          writeFileSync(
            `dependencies-${theme}-smoke.png`,
            (await w.capturePage(bounds)).toPNG(),
          );
        }
        await clickParent();
        const after = await states();
        pass =
          pass &&
          (await sameValues(values)) &&
          after.every(
            (s: any, i: number) =>
              !s.disabled &&
              s.checked === String(values[i]) &&
              s.bg === before[i].bg &&
              s.cursor === before[i].cursor &&
              s.opacity === before[i].opacity &&
              s.text === before[i].text &&
              s.desc === before[i].desc &&
              s.knob === before[i].knob &&
              s.rowHeight === before[i].rowHeight &&
              s.overlayContent === "none",
          );
        if (!pass) errors.push(theme + ":" + mask);
        all = all && pass;
        cases++;
      }
    }
    // Leave a saved mixed, disabled state for a separate Electron process.
    await js(
      "window.browser.load().then(c=>{c.bookmarksBar=true;c.preferences.showGroupNames=true;c.preferences.showBookmarkGroups=false;c.preferences.liveDetection=true;return window.browser.save(c)})",
    );
    root.reload();
    await wait(270);
    await enter();
    await clickParent();
    console.log(JSON.stringify({ cases, pass: all, errors }));
    app.exit(all ? 0 : 1);
  } catch (error) {
    console.error(
      "Bookmark dependency UI test failed",
      stage,
      error instanceof Error ? error.message : "unknown",
    );
    app.exit(1);
  } finally {
    clearTimeout(deadline);
  }
});
