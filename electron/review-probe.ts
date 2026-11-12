// Read-only application review: uses a fresh temporary profile, never the user's session.
import { app, BrowserWindow, WebContentsView } from "electron";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
app.setPath("userData", app.getPath("temp") + "/mvb-review-" + Date.now());
const wav = Buffer.alloc(88244);
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
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<video autoplay loop src="/tone.wav"></video><button>网页按钮</button>',
    );
  }
});
void (async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port,
    c = defaults();
  c.session.pages = [
    newPage(`http://127.0.0.1:${port}/a`),
    newPage(`http://127.0.0.1:${port}/b`),
  ];
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(app.getPath("userData") + "/config.json", JSON.stringify(c));
  void import("./main");
  app.whenReady().then(async () => {
    try {
      await new Promise((r) => setTimeout(r, 2500));
      const w = BrowserWindow.getAllWindows().find(
          (v) => v.webContents.getTitle() === "MultiView Browser",
        )!,
        wc = w.webContents;
      const get = () => wc.executeJavaScript("window.browser.load()");
      const save = (config: unknown) =>
        wc.executeJavaScript(`window.browser.save(${JSON.stringify(config)})`);
      const stale = await get();
      await wc.executeJavaScript(
        `(async()=>{const c=await window.browser.load(),r=document.querySelector('.audio-toggle').getBoundingClientRect();await window.browser.showVolume(c.session.pages[0].id,{x:r.x,y:r.y,width:r.width,height:r.height})})()`,
      );
      const popup = BrowserWindow.getAllWindows().find((v) =>
        v.webContents.getURL().endsWith("volume.html"),
      )!;
      await popup.webContents.executeJavaScript(
        `(()=>{const input=document.querySelector('input');input.value='25';input.dispatchEvent(new Event('input',{bubbles:true}))})()`,
      );
      await new Promise((r) => setTimeout(r, 350));
      const changed = await get();
      await save(stale);
      await new Promise((r) => setTimeout(r, 100));
      const overwritten = await get();
      const views = w.contentView.children.filter(
        (v) => v instanceof WebContentsView && v.webContents !== wc,
      ) as WebContentsView[];
      const rootSelectedBefore = await wc.executeJavaScript(
        `document.querySelector('.pane.selected')?.dataset.slot`,
      );
      views[1].webContents.focus();
      views[1].webContents.sendInputEvent({
        type: "mouseDown",
        button: "left",
        x: 20,
        y: 20,
        clickCount: 1,
      });
      views[1].webContents.sendInputEvent({
        type: "mouseUp",
        button: "left",
        x: 20,
        y: 20,
        clickCount: 1,
      });
      await new Promise((r) => setTimeout(r, 100));
      const rootSelectedAfter = await wc.executeJavaScript(
        `document.querySelector('.pane.selected')?.dataset.slot`,
      );
      const muted = await get();
      muted.session.pages[1].audio = "muted";
      muted.session.pages[1].volume = 25;
      await save(muted);
      await new Promise((r) => setTimeout(r, 150));
      const nativeBefore = views[1].webContents.isAudioMuted();
      await views[1].webContents.executeJavaScript(
        `document.querySelector('video').volume=.75`,
      );
      await new Promise((r) => setTimeout(r, 350));
      const afterSite = await get();
      // Real Chromium media replacement on the local test page, retaining the old DOM node.
      await views[1].webContents.executeJavaScript(
        `(async()=>{const old=document.querySelector('video');old.pause();const next=old.cloneNode(true);next.id='replacement';document.body.append(next);await next.play()})()`,
      );
      await new Promise((r) => setTimeout(r, 200));
      const replacementConfig = await get();
      replacementConfig.session.pages[1].volume = 25;
      await save(replacementConfig);
      await new Promise((r) => setTimeout(r, 200));
      const replacementVolume = await views[1].webContents.executeJavaScript(
        "document.querySelector('#replacement').volume",
      );
      await views[1].webContents.executeJavaScript(
        "document.querySelector('#replacement').volume=.5",
      );
      await new Promise((r) => setTimeout(r, 250));
      const afterReplacement = await get();
      const replacementPass =
        replacementVolume === 0.25 &&
        afterReplacement.session.pages[1].volume === 50 &&
        afterReplacement.session.pages[1].audio === "muted";
      const pass =
        replacementPass &&
        changed.session.pages[0].volume === 25 &&
        overwritten.session.pages[0].volume === 25 &&
        nativeBefore &&
        afterSite.session.pages[1].audio === "muted" &&
        views[1].webContents.isAudioMuted();
      writeFileSync(
        "review-runtime-results.json",
        JSON.stringify(
          {
            pass,
            replacementPass,
            replacementVolume,
            replacementReported: afterReplacement.session.pages[1].volume,
            staleSave: {
              initial: stale.session.pages[0].volume,
              afterPopup: changed.session.pages[0].volume,
              afterStaleSave: overwritten.session.pages[0].volume,
            },
            focus: {
              rootSelectedBefore,
              rootSelectedAfter,
              secondFocused: views[1].webContents.isFocused(),
            },
            siteVolumeUnmutes: {
              nativeBefore,
              audioAfter: afterSite.session.pages[1].audio,
              nativeAfter: views[1].webContents.isAudioMuted(),
            },
          },
          null,
          2,
        ),
      );
      server.close();
      app.exit(pass ? 0 : 1);
    } catch (e) {
      writeFileSync("review-runtime-results.json", String(e));
      server.close();
      app.exit(1);
    }
  });
})();
