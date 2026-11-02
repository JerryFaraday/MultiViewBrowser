import { app, BrowserWindow, WebContentsView } from "electron";
import { writeFileSync } from "node:fs";
app.setPath("userData", app.getPath("temp") + "/mvb-bili-app-" + Date.now());
void import("./main");
app.whenReady().then(async () => {
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const root = BrowserWindow.getAllWindows().find(
      (w) => w.webContents.getTitle() === "MultiViewBrowser",
    )!;
    await root.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('.toolbar button')).find(b=>b.textContent==='＋ 网页').click()`,
    );
    await new Promise((r) => setTimeout(r, 14000));
    const view = root.contentView.children.find(
      (v) => v instanceof WebContentsView && v.webContents !== root.webContents,
    ) as WebContentsView;
    const diagnostics: unknown[] = [];
    view.webContents.ipc.on("audio-status", (_e, data) =>
      diagnostics.push(data),
    );
    const state = async () => ({
      config: await root.webContents.executeJavaScript("window.browser.load()"),
      player: await view.webContents.executeJavaScript(
        `({volume:document.querySelector('video')?.volume,info:window.playerInstance?.getPlayerInfo?.()})`,
      ),
    });
    const results: any = { initial: await state(), steps: [] };
    await root.webContents.executeJavaScript(
      `(async()=>{const c=await window.browser.load();const r=document.querySelector('.audio-toggle').getBoundingClientRect();await window.browser.showVolume(c.session.pages[0].id,{x:r.x,y:r.y,width:r.width,height:r.height})})()`,
    );
    const popup = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith("volume.html"),
    )!;
    for (const value of [75, 25, 50, 100]) {
      await popup.webContents.executeJavaScript(
        `(()=>{const input=document.querySelector('input');input.value='${value}';input.dispatchEvent(new Event('input',{bubbles:true}))})()`,
      );
      await new Promise((r) => setTimeout(r, 700));
      results.steps.push({ requested: value, ...(await state()) });
    }
    results.masters = [];
    for (const value of [25, 50, 75, 100, 150]) {
      await root.webContents.executeJavaScript(
        `(()=>{const input=document.querySelector('.master-volume input'),current=+input.value,key=current>${value}?'ArrowLeft':'ArrowRight';for(let i=0;i<Math.abs(current-${value})/5;i++)input.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key}))})()`,
      );
      await new Promise((r) => setTimeout(r, 500));
      results.masters.push({
        requested: value,
        ...(await state()),
        audio: diagnostics.at(-1),
      });
    }
    results.pass =
      results.steps.every(
        (s: any) =>
          s.config.session.pages[0]?.volume === s.requested &&
          s.player.info?.volume?.value === s.requested,
      ) &&
      results.masters.every(
        (s: any) =>
          s.config.masterVolume === s.requested &&
          s.audio?.gain === s.requested / 100 &&
          s.audio?.context === "running",
      );
    results.diagnostics = diagnostics.slice(-15);
    writeFileSync(
      "bilibili-app-smoke-results.json",
      JSON.stringify(results, null, 2),
    );
    app.exit(results.pass ? 0 : 1);
  } catch (e) {
    writeFileSync("bilibili-app-smoke-results.json", String(e));
    app.exit(1);
  }
});
