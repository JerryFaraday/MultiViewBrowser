import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { BrowserManager } from "./BrowserManager";
import { DragOverlay } from "./DragOverlay";
import { swapPages } from "../src/core/AudioManager";
import { newPage } from "../src/core/model";
app.setPath("userData", app.getPath("temp") + "/mvb-overlay-" + Date.now());
app.whenReady().then(async () => {
  const wav = Buffer.alloc(44 + 88200);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(44100, 24);
  wav.writeUInt32LE(88200, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(88200, 40);
  for (let i = 0; i < 44100; i++)
    wav.writeInt16LE(Math.round(1000 * Math.sin(i * 0.06)), 44 + i * 2);
  const server = createServer((q, res) => {
    if (q.url === "/tone.wav") {
      res.setHeader("Content-Type", "audio/wav");
      res.end(wav);
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      q.url === "/frame"
        ? '<body style="margin:0"><video autoplay loop src="/tone.wav" style="display:block;width:390px;height:160px"></video><textarea style="display:block;width:380px;height:170px">聊天输入框</textarea><script>window.clicks=0;window.drops=0;document.addEventListener("mousedown",()=>window.clicks++,true);document.addEventListener("drop",()=>window.drops++,true)</script>'
        : '<iframe src="/frame" style="position:absolute;inset:0;width:390px;height:390px;border:0"></iframe>',
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const w = new BrowserWindow({ show: true, width: 1000, height: 650 }),
      m = new BrowserManager(w),
      port = (server.address() as { port: number }).port;
    m.setVolume(0);
    const a = newPage(`http://127.0.0.1:${port}/a`),
      b = newPage(`http://127.0.0.1:${port}/b`);
    let pages = [a, b],
      drops = 0;
    const targets = [0, 1].map((slot) => ({
      slot,
      rect: { x: slot * 400, y: 0, width: 400, height: 400 },
    }));
    const sync = () => {
      m.sync({ pages, layoutId: "test", tree: { kind: "leaf", slot: 0 } });
      m.bounds(
        pages.map((p, i) => ({
          id: p.id,
          rect: targets[i].rect,
          scale: { ...p.scale, mode: "responsive" },
        })),
      );
    };
    const overlay = new DragOverlay(w, (source, slot) => {
      pages = swapPages(
        pages,
        pages.findIndex((p) => p.id === source),
        slot,
      );
      sync();
      drops++;
    });
    sync();
    await new Promise((r) => setTimeout(r, 900));
    const identities = [...m.views.values()].map((v) => v.webContents.id),
      outcomes = [];
    for (const point of [
      { x: 420, y: 20 },
      { x: 420, y: 220 },
    ]) {
      await overlay.begin(pages[0].id, targets);
      const surface = BrowserWindow.getAllWindows().find((v) => v !== w)!,
        wc = surface.webContents;
      wc.debugger.attach("1.3");
      wc.sendInputEvent({
        type: "mouseDown",
        button: "left",
        x: point.x,
        y: point.y,
        clickCount: 1,
      });
      wc.sendInputEvent({
        type: "mouseUp",
        button: "left",
        x: point.x,
        y: point.y,
        clickCount: 1,
      });
      await new Promise((r) => setTimeout(r, 300));
      const background = await Promise.all(
        [...m.views.values()].map((v) =>
          v.webContents.executeJavaScript(
            `(()=>{const win=document.querySelector('iframe').contentWindow;return {playing:!win.document.querySelector('video').paused,time:win.document.querySelector('video').currentTime,clicks:win.clicks,drops:win.drops}})()`,
          ),
        ),
      );
      for (const type of ["dragEnter", "dragOver", "drop"])
        await wc.debugger.sendCommand("Input.dispatchDragEvent", {
          type,
          x: point.x,
          y: point.y,
          data: {
            items: [{ mimeType: "application/x-mvb-slot", data: "1" }],
            dragOperationsMask: 16,
          },
        });
      await new Promise((r) => setTimeout(r, 150));
      wc.debugger.detach();
      outcomes.push({
        point,
        drops,
        background,
        overlayHidden: !surface.isVisible(),
      });
    }
    const result = {
      outcomes,
      preserved: [...m.views.values()].every(
        (v, i) => v.webContents.id === identities[i],
      ),
      visible: [...m.views.values()].every((v) => v.getVisible()),
      pass:
        drops === 2 &&
        outcomes.every(
          (o) =>
            o.overlayHidden &&
            o.background.every(
              (b) => b.playing && b.clicks === 0 && b.drops === 0,
            ),
        ),
    };
    writeFileSync("drag-smoke-results.json", JSON.stringify(result, null, 2));
    m.destroy();
    w.destroy();
    server.close();
    app.exit(result.pass ? 0 : 1);
  } catch (e) {
    writeFileSync("drag-smoke-results.json", String(e));
    server.close();
    app.exit(1);
  }
});
