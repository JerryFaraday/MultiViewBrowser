import { artifactOutputPath } from "../../scripts/test-artifacts.mjs";
import { app, BrowserWindow, WebContentsView } from "electron";
import { writeFileSync } from "node:fs";
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
app.whenReady().then(async () => {
  const w = new BrowserWindow({
      width: 900,
      height: 600,
      show: true,
      webPreferences: { backgroundThrottling: true },
    }),
    v = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: true,
        disableHtmlFullscreenWindowResize: true,
      },
    });
  w.contentView.addChildView(v);
  v.setBounds({ x: 0, y: 0, width: 450, height: 350 });
  try {
    await v.webContents.loadURL(
      'data:text/html,<div id="p" style="background:red;width:200px;height:100px">media</div>',
    );
    let entered = 0,
      left = 0;
    v.webContents.on("enter-html-full-screen", () => entered++);
    v.webContents.on("leave-html-full-screen", () => left++);
    await v.webContents.executeJavaScript(
      'document.getElementById("p").requestFullscreen()',
      true,
    );
    await wait(200);
    const full = await v.webContents.executeJavaScript(
      "({active:!!document.fullscreenElement,width:document.fullscreenElement?.getBoundingClientRect().width,inner:innerWidth})",
    );
    const results: any = {
      html: full,
      entered,
      windowFullscreen: w.isFullScreen(),
      viewBounds: v.getBounds(),
      backgroundThrottling: v.webContents.getBackgroundThrottling(),
    };
    await v.webContents.executeJavaScript("document.exitFullscreen()");
    await wait(100);
    results.left = left;
    await v.webContents.executeJavaScript(
      "window.onbeforeunload=()=>false;true",
    );
    let veto = false;
    v.webContents.on("will-prevent-unload", () => (veto = true));
    v.webContents.close({ waitForBeforeUnload: true });
    await wait(300);
    results.beforeUnload = { veto, alive: !v.webContents.isDestroyed() };
    writeFileSync(
      artifactOutputPath("resource-compat-results.json"),
      JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify(results));
  } catch {
    console.error("Resource compatibility probe failed");
  }
  w.destroy();
  if (!v.webContents.isDestroyed()) v.webContents.close();
  app.exit(0);
});
