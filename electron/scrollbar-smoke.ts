import { app, BrowserWindow, WebContentsView, nativeTheme } from "electron";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { applyNativeTheme, initializeNativeScrollbars } from "./NativeTheme";
const baseline = process.env.MVB_SCROLLBAR_BASELINE === "1";
if (!baseline) initializeNativeScrollbars();
app.setPath("userData", app.getPath("temp") + "/mvb-scrollbar-" + Date.now());
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
type ProbeState = {
  dark: boolean;
  scheme: string;
  client: number;
  scroll: number;
  marker?: number;
  color: string;
  time?: number;
  paused?: boolean;
  barWidth: string;
  barColor: string;
  scrollbarColor: string;
};
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  const mode = req.url?.slice(1) ?? "normal";
  const scheme = ["auto", "shadow", "iframe", "frame-light", "frame"].includes(
    mode,
  )
    ? "color-scheme:light dark"
    : mode === "light"
      ? "color-scheme:light"
      : "";
  const custom =
    mode === "custom"
      ? "::-webkit-scrollbar{width:18px}::-webkit-scrollbar-track{background:rgb(220,180,10)}::-webkit-scrollbar-thumb{background:rgb(170,20,130)}"
      : mode === "standard"
        ? ":root{scrollbar-color:rgb(170,20,130) rgb(220,180,10)}"
        : "";
  const frame =
    mode.startsWith("frame-") || mode === "iframe"
      ? `<iframe style="position:fixed;left:50px;top:300px;width:300px;height:180px;border:0;${mode === "frame-light" ? "color-scheme:light" : ""}" src="http://localhost:${(server.address() as any).port}/frame"></iframe>`
      : "";
  const shadow =
    mode === "shadow"
      ? `const host=document.createElement('div');host.style='position:fixed;left:30px;top:60px';document.body.append(host);const root=host.attachShadow({mode:'open'});root.innerHTML='<div style="width:200px;height:200px;overflow:scroll"><div style="height:1000px">shadow fixture</div></div>';`
      : "";
  res.end(
    `<style>:root{${scheme}}body{margin:0;background:rgb(24,32,48);color:white}.long{height:2500px}${custom}</style><div class=long>scrollbar fixture</div>${frame}<video muted autoplay style="position:fixed;left:0;top:0;width:10px;height:10px"></video><script>window.marker=Math.random();${shadow}const c=document.createElement('canvas');c.width=c.height=10;const ctx=c.getContext('2d');function draw(){ctx.fillRect(0,0,10,10);requestAnimationFrame(draw)}draw();document.querySelector('video').srcObject=c.captureStream(20);</script>`,
  );
});
server.listen(0, "127.0.0.1", async () => {
  await app.whenReady();
  const w = new BrowserWindow({
    show: true,
    alwaysOnTop: true,
    width: 650,
    height: 650,
    webPreferences: { backgroundThrottling: false },
  });
  await w.loadURL(
    "data:text/html,<title>Scrollbar theme diagnostic</title><body>Native scrollbar diagnostic</body>",
  );
  const v = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  w.contentView.addChildView(v);
  v.setBounds({ x: 0, y: 0, width: 420, height: 560 });
  v.setVisible(true);
  w.focus();
  v.webContents.focus();
  const wc = v.webContents;
  wc.setAudioMuted(true);
  const initial = {
    source: nativeTheme.themeSource,
    dark: nativeTheme.shouldUseDarkColors,
  };
  const results = [];
  let stage = 0;
  const watchdog = setTimeout(() => {
    writeFileSync(
      "scrollbar-timeout-diagnostic.json",
      JSON.stringify({ stage, cases: results.length }),
    );
    app.exit(1);
  }, 90000);
  try {
    for (const mode of [
      "normal",
      "auto",
      "light",
      "custom",
      "standard",
      "shadow",
      "iframe",
      "frame-light",
      ...(process.env.MVB_THEME_REAL_URL ? ["real"] : []),
    ]) {
      stage = 1;
      const loading = wc.loadURL(
        mode === "real"
          ? process.env.MVB_THEME_REAL_URL!
          : "http://127.0.0.1:" + (server.address() as any).port + "/" + mode,
      );
      if (mode === "real") {
        await Promise.race([loading, wait(20000)]);
        await wait(6000);
      } else await loading;
      stage = 3;
      await wc.mainFrame.executeJavaScript("scrollTo(0,240)");
      for (const theme of [
        "light",
        "dark",
        "gray",
        "black",
        "light",
      ] as const) {
        stage = 2;
        const started = Date.now();
        applyNativeTheme(theme);
        stage = 4;
        wc.sendInputEvent({ type: "mouseMove", x: 415, y: 420 });
        await wait(250);
        stage = 5;
        const state = (await wc.mainFrame.executeJavaScript(
          "({dark:matchMedia('(prefers-color-scheme:dark)').matches,scheme:getComputedStyle(document.documentElement).colorScheme,client:document.documentElement.clientWidth,scroll:scrollY,marker:window.marker,color:getComputedStyle(document.body).backgroundColor,time:document.querySelector('video')?.currentTime,paused:document.querySelector('video')?.paused,barWidth:getComputedStyle(document.documentElement,'::-webkit-scrollbar').width,barColor:getComputedStyle(document.documentElement,'::-webkit-scrollbar-thumb').backgroundColor,scrollbarColor:getComputedStyle(document.documentElement).scrollbarColor})",
        )) as ProbeState;
        stage = 6;
        let im;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            im = await wc.capturePage(undefined, { stayAwake: true });
            if (!im.isEmpty()) break;
          } catch {}
          await wait(100);
        }
        if (!im || im.isEmpty()) throw Error();
        let size = im.getSize(),
          data = im.toBitmap();
        const pixel = (x: number, y: number) => {
          const i =
            (Math.floor((y * size.height) / 560) * size.width +
              Math.floor((x * size.width) / 420)) *
            4;
          return [data[i + 2], data[i + 1], data[i]];
        };
        const children = await Promise.all(
          (mode === "iframe" || mode === "frame-light"
            ? wc.mainFrame.frames.filter((f) => f !== wc.mainFrame)
            : []
          ).map((f) =>
            f.executeJavaScript(
              "({dark:matchMedia('(prefers-color-scheme:dark)').matches,scheme:getComputedStyle(document.documentElement).colorScheme})",
            ),
          ),
        );
        const firstTrack = pixel(414, 420);
        const expectedTrack =
          mode === "custom" || mode === "standard"
            ? [220, 180, 10]
            : theme === "light" ||
                mode === "light" ||
                (baseline && mode === "normal")
              ? [252, 252, 252]
              : [44, 44, 44];
        for (
          let attempt = 0;
          attempt < 20 &&
          JSON.stringify(pixel(414, 420)) !== JSON.stringify(expectedTrack);
          attempt++
        ) {
          await wait(100);
          im = await wc.capturePage(undefined, { stayAwake: true });
          size = im.getSize();
          data = im.toBitmap();
        }
        const item = {
          mode,
          theme,
          source: nativeTheme.themeSource,
          ...state,
          track: pixel(414, 420),
          firstTrack,
          paintDelayMs: Date.now() - started,
          thumb: pixel(414, 100),
          innerTrack:
            mode === "shadow"
              ? pixel(224, 210)
              : mode === "iframe" || mode === "frame-light"
                ? pixel(344, 450)
                : undefined,
          children,
        };
        stage = 7;
        results.push(item);
        writeFileSync(
          `scrollbar-${baseline ? "baseline-" : ""}${mode}-${theme}-smoke.png`,
          im.toPNG(),
        );
        if (mode === "normal" && theme === "black") {
          wc.sendInputEvent({
            type: "mouseDown",
            x: 414,
            y: 100,
            button: "left",
            clickCount: 1,
          });
          wc.sendInputEvent({
            type: "mouseMove",
            x: 414,
            y: 220,
            modifiers: ["leftbuttondown"],
          });
          wc.sendInputEvent({
            type: "mouseUp",
            x: 414,
            y: 220,
            button: "left",
            clickCount: 1,
          });
          await wait(150);
          const dragged = await wc.mainFrame.executeJavaScript("scrollY");
          wc.sendInputEvent({
            type: "mouseWheel",
            x: 150,
            y: 250,
            deltaY: -120,
            deltaX: 0,
          });
          await wait(150);
          const wheeled = await wc.mainFrame.executeJavaScript("scrollY");
          (item as any).dragged = dragged !== state.scroll;
          (item as any).wheeled = wheeled !== dragged;
          await wait(750);
          await wc.mainFrame.executeJavaScript("scrollTo(0,240)");
        }
      }
    }
    const same = (a: number[], b: number[]) =>
      JSON.stringify(a) === JSON.stringify(b);
    const checks = results
      .filter((x) => x.mode !== "real")
      .every((r, _index, all) => {
        const first = all.find((x) => x.mode === r.mode)!;
        const styled = r.mode === "custom" || r.mode === "standard";
        const dark = r.theme !== "light";
        const expected = styled
          ? [220, 180, 10]
          : r.mode === "light" || !dark || (baseline && r.mode === "normal")
            ? [252, 252, 252]
            : [44, 44, 44];
        const inner =
          r.mode === "shadow" ||
          r.mode === "iframe" ||
          r.mode === "frame-light";
        const expectedInner =
          r.mode === "frame-light" || !dark ? [252, 252, 252] : [44, 44, 44];
        return (
          r.dark === dark &&
          r.source === (dark ? "dark" : "light") &&
          r.scroll === 240 &&
          r.marker === first.marker &&
          r.color === first.color &&
          r.client === first.client &&
          r.paused === false &&
          same(r.track, expected) &&
          (!inner || same(r.innerTrack!, expectedInner)) &&
          ((r.mode !== "iframe" && r.mode !== "frame-light") ||
            (r.children.length > 0 &&
              r.children.every(
                (c: any) =>
                  c.dark === (r.mode === "frame-light" ? false : dark),
              )))
        );
      });
    const interaction = results.find(
      (x) => x.mode === "normal" && x.theme === "black",
    ) as any;
    const pass = checks && interaction.dragged && interaction.wheeled;
    writeFileSync(
      baseline
        ? "scrollbar-baseline-diagnostic.json"
        : "scrollbar-diagnostic.json",
      JSON.stringify(
        {
          baseline,
          pass,
          initial,
          environment: {
            electron: process.versions.electron,
            chromium: process.versions.chrome,
          },
          results,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        baseline,
        pass,
        cases: results.length,
        real: results
          .filter((x) => x.mode === "real")
          .map(({ theme, track, color, scheme }) => ({
            theme,
            track,
            color,
            scheme,
          })),
      }),
    );
    app.exit(pass ? 0 : 1);
  } catch {
    console.error("Scrollbar diagnostic failed at stage", stage);
    app.exit(1);
  } finally {
    clearTimeout(watchdog);
    server.close();
  }
});
