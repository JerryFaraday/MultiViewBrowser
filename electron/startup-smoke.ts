import { app, BrowserWindow, dialog } from "electron";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
const [mode, folder, base] = process.argv.slice(2);
app.setPath("userData", folder);
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
if (mode === "save-off") {
  const c = defaults();
  c.preferences.startupWindow = "normal";
  c.session.pages = [newPage(base + "/saved")];
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "config.json"), JSON.stringify(c));
}
void import("./main");
app.whenReady().then(async () => {
  await wait(1600);
  try {
    const w = BrowserWindow.getAllWindows().find(
        (x) => x.webContents.getTitle() === "MultiView Browser",
      )!,
      root = w.webContents;
    let pass = true,
      prompts = 0;
    (dialog as any).showMessageBoxSync = () => {
      prompts++;
      return mode === "restore" && prompts === 1 ? 0 : 1;
    };
    if (mode === "save-off") {
      await root.executeJavaScript(
        `window.browser.load().then(c=>{c.preferences.autoSaveSession=false;c.preferences.startupWindow='last';c.session.pages[0].url=${JSON.stringify(base + "/runtime")};c.workspaces.push({id:'manual',name:'manual',snapshot:structuredClone(c.session),created:'',modified:''});return window.browser.save(c)})`,
      );
      root.reload();
      await wait(650);
      w.setBounds({ x: 30, y: 30, width: 1000, height: 700 });
    } else if (mode === "restore") {
      const c = await root.executeJavaScript("window.browser.load()");
      pass =
        !w.isMaximized() &&
        w.getNormalBounds().width === 1000 &&
        w.getNormalBounds().height === 700 &&
        c.session.pages[0].url.endsWith("/saved") &&
        c.workspaces[0].snapshot.pages[0].url.endsWith("/runtime");
      await root.executeJavaScript(
        "window.browser.load().then(c=>{c.preferences.confirmClose='always';c.preferences.startupContent='blank';return window.browser.save(c)})",
      );
      root.reload();
      await wait(650);
      w.close();
      await wait(450);
      pass = pass && !w.isDestroyed() && prompts === 1;
    } else {
      const c = await root.executeJavaScript("window.browser.load()");
      pass =
        c.session.pages.every((p: unknown) => p === null) &&
        c.workspaces.length === 1;
    }
    w.once("closed", () => {
      const disk = JSON.parse(
        readFileSync(join(folder, "config.json"), "utf8"),
      );
      if (mode === "save-off")
        pass =
          pass &&
          disk.session.pages[0].url.endsWith("/saved") &&
          disk.workspaces[0].snapshot.pages[0].url.endsWith("/runtime");
      if (mode === "restore") pass = pass && prompts === 2;
      writeFileSync(
        "startup-" + mode + "-results.json",
        JSON.stringify({ mode, prompts, pass }, null, 2),
      );
      console.log(JSON.stringify({ mode, prompts, pass }));
      app.exit(pass ? 0 : 1);
    });
    w.close();
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
