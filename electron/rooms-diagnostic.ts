import { app, BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";
import { BrowserManager } from "./BrowserManager";
import { newPage } from "../src/core/model";
app.setPath(
  "userData",
  app.getPath("temp") + "/mvb-room-diagnostic-" + Date.now(),
);
app.whenReady().then(async () => {
  try {
    const w = new BrowserWindow({ show: true, width: 1400, height: 900 }),
      m = new BrowserManager(w),
      pages = ["35", "6", "55"].map((id) =>
        newPage("https://live.bilibili.com/" + id),
      );
    m.sync({ pages, tree: { kind: "leaf", slot: 0 }, layoutId: "diag" });
    m.bounds(
      pages.map((p, i) => ({
        id: p.id,
        rect: { x: i * 450, y: 0, width: 450, height: 800 },
        scale: { ...p.scale, mode: "responsive" },
      })),
    );
    const statuses: Record<string, unknown[]> = {};
    for (const p of pages) {
      statuses[p.url] = [];
      m.views
        .get(p.id)!
        .webContents.ipc.on("audio-status", (_e, data) =>
          statuses[p.url].push(data),
        );
    }
    await new Promise((r) => setTimeout(r, 40000));
    for (const p of pages) m.pageVolumes.set(p.id, 25);
    m.setVolume(50);
    await new Promise((r) => setTimeout(r, 500));
    const probes: Record<string, unknown[]> = {};
    for (const p of pages) {
      probes[p.url] = [];
      const wc = m.views.get(p.id)!.webContents;
      for (const value of [25, 50, 100, 150]) {
        m.setVolume(value);
        await new Promise((r) => setTimeout(r, 150));
        const levels = await new Promise((resolve) => {
          const handler = (_e: unknown, data: unknown) => {
            clearTimeout(timeout);
            resolve(data);
          };
          const timeout = setTimeout(() => {
            wc.ipc.removeListener("audio-probe-result", handler);
            resolve([]);
          }, 2000);
          wc.ipc.once("audio-probe-result", handler);
          wc.send("audio-probe");
        });
        probes[p.url].push({ master: value, levels });
      }
    }
    m.setVolume(50);
    const results = [];
    for (const p of pages) {
      const wc = m.views.get(p.id)!.webContents;
      const frames = [];
      for (const frame of wc.mainFrame.framesInSubtree)
        try {
          frames.push({
            url: frame.url,
            data: await frame.executeJavaScript(
              `(()=>{const roots=[document],media=[],shadows=[];for(let i=0;i<roots.length;i++){const root=roots[i];for(const el of root.querySelectorAll('*')){if(el.shadowRoot){roots.push(el.shadowRoot);shadows.push(el.tagName)}if(el.matches('audio,video'))media.push({tag:el.tagName,src:el.currentSrc||el.src,volume:el.volume,muted:el.muted,paused:el.paused,ready:el.readyState})}}return {title:document.title,text:document.body?.innerText.slice(-700),media,shadows,playerAPI:['playerInstance','__INTERACTIVE_PLAYER__','EmbedPlayer','livePlayer'].map(k=>{const p=window[k];return {key:k,type:typeof p,methods:p?Object.getOwnPropertyNames(Object.getPrototypeOf(p)||{}):[],info:typeof p?.getPlayerInfo==='function'?p.getPlayerInfo():null}}),players:Object.keys(window).filter(k=>/player/i.test(k)).slice(0,25),volumeUI:[...document.querySelectorAll('[class*=volume],[class*=Volume]')].slice(0,20).map(e=>({cls:e.className,html:e.outerHTML.slice(0,600)}))}})()`,
            ),
          });
        } catch (e) {
          frames.push(String(e));
        }
      results.push({
        url: p.url,
        frames,
        probes: probes[p.url],
        status: statuses[p.url].slice(-8),
      });
    }
    writeFileSync("rooms-diagnostic.json", JSON.stringify(results, null, 2));
    m.destroy();
    w.destroy();
    app.exit();
  } catch (e) {
    writeFileSync("rooms-diagnostic.json", String(e));
    app.exit(1);
  }
});
