import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { BrowserManager } from "./BrowserManager";
import { newPage, type Snapshot } from "../src/core/model";
app.setPath("userData", app.getPath("temp") + "/multiview-audio-" + Date.now());
app.whenReady().then(async () => {
  const wav = Buffer.alloc(44 + 44100 * 2);
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
    wav.writeInt16LE(
      Math.round(6000 * Math.sin((2 * Math.PI * 440 * i) / 44100)),
      44 + i * 2,
    );
  const server = createServer((q, res) => {
    if (q.url === "/tone.wav") {
      res.setHeader("Content-Type", "audio/wav");
      res.end(wav);
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      q.url === "/frame"
        ? '<video autoplay loop src="/tone.wav"></video>'
        : '<iframe src="/frame"></iframe>',
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const port = (server.address() as { port: number }).port,
      w = new BrowserWindow({ show: false }),
      m = new BrowserManager(w),
      p = newPage(`http://127.0.0.1:${port}`),
      q = newPage(p.url);
    p.volume = 25;
    p.audio = "unmuted";
    q.volume = 50;
    q.audio = "unmuted";
    const snapshot: Snapshot = {
      pages: [p, q],
      tree: { kind: "leaf", slot: 0 },
      layoutId: "test",
    };
    m.sync(snapshot);
    await new Promise((r) => setTimeout(r, 1000));
    m.setVolume(80);
    await new Promise((r) => setTimeout(r, 200));
    const views = [...m.views.values()];
    const results: any = {
      volumes: await Promise.all(
        views.map((v) =>
          v.webContents.executeJavaScript(
            'document.querySelector("iframe").contentDocument.querySelector("video").volume',
          ),
        ),
      ),
    };
    await views[0].webContents.executeJavaScript(
      'document.querySelector("iframe").contentDocument.querySelector("video").volume=.75',
    );
    await new Promise((r) => setTimeout(r, 150));
    results.siteVolume = m.pageVolumes.get(p.id);
    m.pageVolumes.set(p.id, 25);
    m.setVolume(80);
    await new Promise((r) => setTimeout(r, 100));
    results.absolute25 = await views[0].webContents.executeJavaScript(
      'document.querySelector("iframe").contentDocument.querySelector("video").volume',
    );
    m.setPresentationMuted(true);
    m.sync(snapshot);
    m.setVolume(90);
    results.maximizedMuted = views.map((v) => v.webContents.isAudioMuted());
    m.setPresentationMuted(false);
    results.restoredMuted = views.map((v) => v.webContents.isAudioMuted());
    m.setVolume(0);
    results.masterMuted = views.map((v) => v.webContents.isAudioMuted());
    m.setVolume(80);
    results.restoredVolumes = await Promise.all(
      views.map((v) =>
        v.webContents.executeJavaScript(
          'document.querySelector("iframe").contentDocument.querySelector("video").volume',
        ),
      ),
    );
    m.setVolume(50);
    await new Promise((r) => setTimeout(r, 200));
    results.signal = await new Promise((resolve) => {
      views[0].webContents.ipc.once("audio-probe-result", (_e, data) =>
        resolve(data),
      );
      views[0].webContents.send("audio-probe");
    });
    results.pass =
      Math.abs(results.volumes[0] - 0.25) < 0.001 &&
      Math.abs(results.volumes[1] - 0.5) < 0.001 &&
      results.signal[0]?.inputRms > 0.0001 &&
      Math.abs(results.signal[0].ratio - 0.5) < 0.05 &&
      results.siteVolume === 75 &&
      results.absolute25 === 0.25 &&
      results.maximizedMuted[0] === false &&
      results.maximizedMuted[1] === true &&
      results.masterMuted.every(Boolean) &&
      results.restoredMuted.every((v: boolean) => !v);
    writeFileSync("audio-smoke-results.json", JSON.stringify(results, null, 2));
    m.destroy();
    w.destroy();
    server.close();
    app.exit(results.pass ? 0 : 1);
  } catch (e) {
    writeFileSync("audio-smoke-results.json", String(e));
    server.close();
    app.exit(1);
  }
});
