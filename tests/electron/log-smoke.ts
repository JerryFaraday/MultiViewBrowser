import { until } from "./SmokeDeadline";
import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { defaults } from "../../src/core/WorkspaceManager";
import { newPage } from "../../src/core/model";

const marker = "PRIVATE_LOG_SMOKE_MARKER";
const server = createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html");
  response.end(
    `<title>${marker}</title><input id="private" value="${marker}">`,
  );
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address() as { port: number };
  const config = defaults();
  const page = newPage(`http://127.0.0.1:${address.port}/${marker}`);
  page.scale.mode = "responsive";
  config.session.pages = [page];
  app.setPath("userData", app.getPath("temp") + "/mvb-log-smoke-" + Date.now());
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(
    app.getPath("userData") + "/config.json",
    JSON.stringify(config),
  );
  void import("../../electron/main");
  void app.whenReady().then(async () => {
    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    await wait(2500);
    try {
      const window = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getTitle() === "MultiView Browser",
      )!;
      const point = await window.webContents.executeJavaScript(
        `(()=>{const r=document.querySelector('.master-mute').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`,
      );
      window.webContents.sendInputEvent({
        type: "mouseDown",
        ...point,
        button: "left",
        clickCount: 1,
      });
      window.webContents.sendInputEvent({
        type: "mouseUp",
        ...point,
        button: "left",
        clickCount: 1,
      });
      await wait(300);
      await window.webContents.executeJavaScript(
        `window.browser.log('ui.change',{area:'pane',slot:0,url:'https://${marker}',title:'${marker}',input:'${marker}'})`,
      );
      const view = window.contentView.children.find(
        (v) =>
          "webContents" in v &&
          (v as Electron.WebContentsView).webContents !== window.webContents &&
          (v as Electron.WebContentsView).webContents.getURL() === page.url,
      ) as Electron.WebContentsView;
      window.focus();
      view.webContents.focus();
      await wait(150);
      console.log("page-target", {
        id: view.webContents.id,
        root: window.webContents.id,
        visible: view.getVisible(),
        bounds: view.getBounds(),
        focused: view.webContents.isFocused(),
      });
      await view.webContents.executeJavaScript(
        "window.__trustedClicks=0;document.addEventListener('pointerdown',e=>{if(e.isTrusted)window.__trustedClicks++},true)",
      );
      const target = await view.webContents.executeJavaScript(
        "(()=>{const r=document.querySelector('input').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()",
      );
      console.log(
        "hit-test",
        await view.webContents.executeJavaScript(
          "({rect:document.querySelector('input').getBoundingClientRect().toJSON(),inner:[innerWidth,innerHeight],state:document.visibilityState,target:document.elementFromPoint(100,20)?.tagName})",
        ),
      );
      // Chromium Input injects a real trusted pointer event in page coordinates.
      // Unlike native sendInputEvent, this does not depend on desktop widget routing.
      view.webContents.debugger.attach("1.3");
      try {
        await view.webContents.debugger.sendCommand(
          "Emulation.setFocusEmulationEnabled",
          { enabled: true },
        );
        await view.webContents.debugger.sendCommand(
          "Input.dispatchMouseEvent",
          { type: "mousePressed", ...target, button: "left", clickCount: 1 },
        );
        await view.webContents.debugger.sendCommand(
          "Input.dispatchMouseEvent",
          { type: "mouseReleased", ...target, button: "left", clickCount: 1 },
        );
        await until("trusted-page-input", () =>
          view.webContents.executeJavaScript("window.__trustedClicks>0"),
        );
      } finally {
        view.webContents.debugger.detach();
      }
      await wait(100);
      const trusted = await view.webContents.executeJavaScript(
        "window.__trustedClicks",
      );
      console.log("trusted-page-clicks", trusted);
      if (trusted < 1)
        throw Error("Real page pointer event did not reach target");
      view.webContents.insertText(marker);
      await wait(300);
      server.close();
      window.close();
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
});
