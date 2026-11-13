import { app, BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";
app.setPath("userData", app.getPath("temp") + "/mvb-layout-" + Date.now());
void import("./main");
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
app.whenReady().then(async () => {
  await wait(1600);
  try {
    const w = BrowserWindow.getAllWindows().find(
        (x) => x.webContents.getTitle() === "MultiView Browser",
      )!,
      wc = w.webContents;
    await wc.executeJavaScript(
      "Array.from(document.querySelectorAll('.toolbar>button')).find(b=>b.textContent==='设置').click()",
    );
    await wait(150);
    wc.debugger.attach("1.3");
    const cases = [];
    for (const [width, height, dpi, zoom] of [
      [1920, 1080, 1, 1],
      [2560, 1440, 1.5, 1],
      [3840, 2160, 2, 1.25],
      [800, 600, 1.5, 1.25],
      [640, 420, 2, 1],
    ]) {
      await wc.debugger.sendCommand("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: dpi,
        mobile: false,
      });
      wc.setZoomFactor(zoom);
      await wait(120);
      const result = await wc.executeJavaScript(
        `(()=>{const modal=document.querySelector('.settings-page'),r=modal.getBoundingClientRect(),nav=document.querySelector('.settings-tabs'),content=document.querySelector('.settings-content');return {fits:r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,centered:Math.abs((r.left+r.right)/2-innerWidth/2)<1&&Math.abs((r.top+r.bottom)/2-innerHeight/2)<1,size:Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1,nav:nav.scrollHeight<=nav.clientHeight+1&&getComputedStyle(nav).overflowY==='hidden',scroll:getComputedStyle(content).overflowY==='auto'&&getComputedStyle(modal).overflowY==='hidden',aligned:Array.from(document.querySelectorAll('.setting-row')).every(row=>{const a=row.firstElementChild.getBoundingClientRect(),b=row.lastElementChild.getBoundingClientRect();return a.right<=b.left+1&&b.right<=content.getBoundingClientRect().right+1}),fonts:getComputedStyle(modal.querySelector('h1')).fontSize==='18px'&&getComputedStyle(nav.querySelector('button')).fontSize==='13px'}})()`,
      );
      cases.push({ width, height, dpi, zoom, ...result });
    }
    await wc.debugger.sendCommand("Emulation.setDeviceMetricsOverride", {
      width: 800,
      height: 500,
      deviceScaleFactor: 1,
      mobile: false,
    });
    wc.setZoomFactor(1);
    await wait(100);
    await wc.executeJavaScript(
      "Array.from(document.querySelectorAll('.settings-tabs button')).find(b=>b.textContent==='数据与隐私').click()",
    );
    await wait(80);
    const navTop = await wc.executeJavaScript(
      "document.querySelector('.settings-tabs').getBoundingClientRect().top",
    );
    const scrolled = await wc.executeJavaScript(
      "(()=>{const c=document.querySelector('.settings-content');c.scrollTop=250;return c.scrollTop>0})()",
    );
    await wc.executeJavaScript(
      "Array.from(document.querySelectorAll('.settings-tabs button')).find(b=>b.textContent==='常规').click()",
    );
    await wait(50);
    const reset = await wc.executeJavaScript(
        "document.querySelector('.settings-content').scrollTop===0",
      ),
      fixed = await wc.executeJavaScript(
        'document.querySelector(".settings-tabs").getBoundingClientRect().top===' +
          navTop,
      );
    try {
      writeFileSync(
        "settings-layout-smoke.png",
        (await wc.capturePage()).toPNG(),
      );
    } catch {}
    await wc.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
    wc.debugger.detach();
    await wc.executeJavaScript(
      "document.querySelector('.settings-back').click()",
    );
    await wait(60);
    const closed = await wc.executeJavaScript(
      "!document.querySelector('.settings-page')",
    );
    const pass =
      cases.every(
        (x) =>
          x.fits &&
          x.centered &&
          x.size &&
          x.nav &&
          x.scroll &&
          x.aligned &&
          x.fonts,
      ) &&
      scrolled &&
      reset &&
      fixed &&
      closed;
    const result = { cases, scrolled, reset, fixed, closed, pass };
    writeFileSync(
      "settings-layout-smoke-results.json",
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
    app.exit(pass ? 0 : 1);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
