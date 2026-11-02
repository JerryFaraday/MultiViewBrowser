import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";

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
  void import("./main");
  void app.whenReady().then(async () => {
    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    await wait(2500);
    try {
      const window = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getTitle() === "MultiViewBrowser",
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
        (v) => "webContents" in v,
      ) as Electron.WebContentsView;
      view.webContents.sendInputEvent({
        type: "mouseDown",
        x: 40,
        y: 15,
        button: "left",
        clickCount: 1,
      });
      view.webContents.sendInputEvent({
        type: "mouseUp",
        x: 40,
        y: 15,
        button: "left",
        clickCount: 1,
      });
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
