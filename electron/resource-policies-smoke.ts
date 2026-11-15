import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { BrowserManager } from "./BrowserManager";
import { PageStash } from "./PageStash";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage, type Snapshot } from "../src/core/model";
import { defaultPreferences } from "../src/core/Preferences";
app.setPath("userData", app.getPath("temp") + "/mvb-policy-" + Date.now());
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  let requests = 0;
  const server = createServer((q, r) => {
    requests++;
    r.setHeader("Content-Type", "text/html");
    r.end(
      q.url === "/media"
        ? `<div id="full">fullscreen</div><video muted autoplay></video><audio></audio><canvas></canvas><script>window.marker=Math.random();const v=document.querySelector('video'),c=document.querySelector('canvas');v.srcObject=c.captureStream(10);setInterval(()=>c.getContext('2d').fillRect(0,0,5,5),100);</script>`
        : '<title>Static title</title><div id="full">idle</div><script>window.marker=Math.random()</script>',
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  const w = new BrowserWindow({ width: 1200, height: 800, show: true }),
    m = new BrowserManager(w),
    p = defaultPreferences();
  const pages = [newPage(base + "/media"), newPage(base + "/media")];
  pages[1].audio = "unmuted";
  const snap: Snapshot = {
    layoutId: "test",
    tree: {
      kind: "split",
      axis: "x",
      ratios: [0.5, 0.5],
      children: [
        { kind: "leaf", slot: 0 },
        { kind: "leaf", slot: 1 },
      ],
    },
    pages,
  };
  const result: Record<string, boolean> = new Proxy(
    {},
    {
      set(target: Record<string, boolean>, key: string, value: boolean) {
        console.log(key, value);
        target[key] = value;
        return true;
      },
    },
  );
  const watchdog = setTimeout(() => {
    console.error("Policy smoke timed out");
    m.destroy();
    w.destroy();
    server.close();
    app.exit(1);
  }, 25000);
  try {
    m.setPreferences(p);
    m.sync(snap);
    const layout = () =>
      m.bounds(
        snap.pages.flatMap((page, i) =>
          page
            ? [
                {
                  id: page.id,
                  rect: { x: i * 550, y: 40, width: 550, height: 650 },
                  scale: page.scale,
                },
              ]
            : [],
        ),
      );
    layout();
    await wait(900);
    const a = m.views.get(pages[0].id)!,
      b = m.views.get(pages[1].id)!;
    a.webContents.on("console-message", (event) =>
      console.log("pageconsole", event.level, event.message),
    );
    const media = (v: typeof a) =>
      v.webContents.executeJavaScript(
        '!document.querySelector("video").paused',
      );
    const marker = await a.webContents.executeJavaScript("window.marker");
    result.backgroundDefault =
      a.webContents.getBackgroundThrottling() &&
      b.webContents.getBackgroundThrottling();
    m.setPreferences({ ...p, backgroundThrottling: false });
    result.backgroundDisabled =
      !a.webContents.getBackgroundThrottling() &&
      !b.webContents.getBackgroundThrottling();
    m.setPreferences(p);
    const timerPage = newPage(base + "/timer");
    m.sync(snap, [timerPage]);
    layout();
    await wait(200);
    const timerView = m.views.get(timerPage.id)!;
    await timerView.webContents.executeJavaScript(
      "window.ticks=0;window.tickTimer=setInterval(()=>window.ticks++,10);true",
    );
    await wait(1200);
    const throttled = await timerView.webContents.executeJavaScript(
      "({ticks:window.ticks,hidden:document.hidden})",
    );
    m.setPreferences({ ...p, backgroundThrottling: false });
    await timerView.webContents.executeJavaScript("window.ticks=0;true");
    await wait(1200);
    const unthrottled = await timerView.webContents.executeJavaScript(
      "({ticks:window.ticks,hidden:document.hidden})",
    );
    writeFileSync(
      "background-throttling-results.json",
      JSON.stringify({ throttled, unthrottled }, null, 2),
    );
    m.setPreferences(p);
    m.sync(snap);
    layout();
    m.setPresentationMuted(true);
    result.defaultMute =
      b.webContents.isAudioMuted() && !a.webContents.isAudioMuted();
    m.setPreferences({ ...p, muteOnMaximize: false });
    result.muteIndependent = !b.webContents.isAudioMuted();
    m.setPreferences({ ...p, pauseOnMaximize: true });
    await wait(150);
    result.pauseAux = (await media(a)) && !(await media(b));
    m.setSettingsOpen(true);
    m.setPreferences({ ...p, pauseOnMaximize: true, pauseInSettings: true });
    await wait(100);
    result.settingsPause = !(await media(a)) && !(await media(b));
    m.setPresentationMuted(false);
    await wait(100);
    result.overlappingReasons = !(await media(b));
    m.setSettingsOpen(false);
    await wait(200);
    result.resumePrior = (await media(a)) && (await media(b));
    result.prepaused = await a.webContents.executeJavaScript(
      'document.querySelector("audio").paused',
    );
    m.setPreferences(p);
    // Main native Fullscreen API and role changes preserve the instance.
    w.focus();
    a.webContents.focus();
    await wait(150);
    await a.webContents.executeJavaScript(
      'void document.querySelector("#full").requestFullscreen().catch(e=>console.log(e.name,e.message))',
      true,
    );
    await wait(300);
    result.mainFullscreen =
      w.isFullScreen() &&
      a.getVisible() &&
      !b.getVisible() &&
      a.getBounds().width === w.getContentBounds().width;
    result.fullscreenViewport = await a.webContents.executeJavaScript(
      "Math.abs(document.fullscreenElement?.getBoundingClientRect().width-innerWidth)<2",
    );
    snap.pages = [pages[1], pages[0]];
    m.sync(snap);
    layout();
    await wait(250);
    result.roleExchange =
      !w.isFullScreen() &&
      a.getVisible() &&
      b.getVisible() &&
      (await a.webContents.executeJavaScript("!!document.fullscreenElement"));
    await a.webContents.executeJavaScript(
      "document.fullscreenElement&&document.exitFullscreen()",
    );
    await wait(150);
    await a.webContents.executeJavaScript(
      'document.querySelector("#full").requestFullscreen()',
      true,
    );
    await wait(150);
    result.auxFullscreen =
      !w.isFullScreen() && b.getVisible() && a.getBounds().width === 550;
    await a.webContents.executeJavaScript("document.exitFullscreen()");
    await wait(100);
    m.toggleApplicationFullscreen();
    await wait(200);
    w.focus();
    b.webContents.focus();
    await b.webContents.executeJavaScript(
      'void document.querySelector("#full").requestFullscreen().catch(e=>console.log(e.name,e.message))',
      true,
    );
    await wait(200);
    await b.webContents.executeJavaScript("document.exitFullscreen()");
    await wait(200);
    result.f11Independent = w.isFullScreen();
    m.exitApplicationFullscreen();
    await wait(200);
    result.instancePreserved =
      marker === (await a.webContents.executeJavaScript("window.marker")) &&
      (await media(a));
    let cycles = true;
    for (let i = 0; i < 10; i++) {
      pages[0].scale = {
        ...pages[0].scale,
        width: i % 2 ? 3840 : 2560,
        height: i % 2 ? 2160 : 1440,
      };
      pages[0].pageZoom = i % 2 ? 1.25 : 0.8;
      m.sync(snap);
      layout();
      w.focus();
      a.webContents.focus();
      await a.webContents.executeJavaScript(
        'void document.querySelector("#full").requestFullscreen()',
        true,
      );
      await wait(60);
      cycles &&=
        !w.isFullScreen() &&
        a.getBounds().width === 550 &&
        (await a.webContents.executeJavaScript("!!document.fullscreenElement"));
      await a.webContents.executeJavaScript("document.exitFullscreen()");
      await wait(60);
      cycles &&=
        a.getBounds().width === 550 &&
        Math.abs(a.webContents.getZoomFactor() - (pages[0].pageZoom ?? 1)) <
          0.0001;
    }
    result.repeatedFullscreenResolutionZoom = cycles;
    await a.webContents.executeJavaScript(
      `document.body.insertAdjacentHTML('beforeend',${JSON.stringify(`<iframe allowfullscreen src="${base.replace("127.0.0.1", "localhost")}/media"></iframe>`)})`,
    );
    await wait(400);
    const frame = a.webContents.mainFrame.framesInSubtree.find((f) =>
      f.url.startsWith(base.replace("127.0.0.1", "localhost")),
    );
    if (frame) {
      await frame.executeJavaScript(
        'void document.querySelector("#full").requestFullscreen()',
        true,
      );
      await wait(150);
      result.crossOriginFullscreen =
        !w.isFullScreen() &&
        Boolean(await frame.executeJavaScript("!!document.fullscreenElement"));
      await frame.executeJavaScript("document.exitFullscreen()");
      await wait(100);
      m.setPreferences({ ...p, pauseInSettings: true });
      m.setSettingsOpen(true);
      await wait(100);
      result.crossOriginPause = Boolean(
        await frame.executeJavaScript('document.querySelector("video").paused'),
      );
      m.setSettingsOpen(false);
      await wait(150);
      result.crossOriginResume = Boolean(
        await frame.executeJavaScript(
          '!document.querySelector("video").paused',
        ),
      );
    } else {
      result.crossOriginFullscreen = false;
      result.crossOriginPause = false;
    }
    m.setPreferences(p);
    // Old retained entries are evaluated once, never the visible pages.
    const safe = newPage(base + "/safe"),
      form = newPage(base + "/form"),
      veto = newPage(base + "/veto");
    const retained = [safe, form, veto].map((page) => ({
      ...page,
      parkedAt: Date.now() - 61 * 60000,
    }));
    m.sync(snap, retained);
    layout();
    await wait(400);
    await m.views
      .get(form.id)!
      .webContents.executeJavaScript('document.body.innerHTML+="<input>"');
    await m.views
      .get(veto.id)!
      .webContents.executeJavaScript(
        'window.addEventListener("beforeunload",e=>{e.preventDefault();e.returnValue=""});true',
      );
    m.setPreferences({ ...p, autoReleaseStash: true, stashReleaseMinutes: 30 });
    await wait(1500);
    result.releaseSafe = !m.views.has(safe.id);
    result.releaseProtected =
      m.views.has(form.id) && m.views.has(veto.id) && m.views.has(pages[0].id);
    snap.pages[1] = safe;
    m.sync(
      snap,
      retained.filter((x) => x.id !== safe.id),
    );
    layout();
    await wait(400);
    result.releaseRestore =
      m.views.has(safe.id) &&
      m.views.get(safe.id)!.webContents.getURL() === safe.url;
    const titleConfig = defaults();
    titleConfig.pageStash = [
      { id: "title", url: base + "/title", title: base + "/title" },
    ];
    const titles = new PageStash(
      w,
      () => titleConfig,
      (id, title) => {
        titleConfig.pageStash.find((x) => x.id === id)!.title = title;
      },
      () => false,
      () => {},
      () => {},
      () => {},
    );
    const before = requests,
      count = m.views.size;
    titles.resolveTitle("title");
    await wait(100);
    result.titleDefaultNoLoad = requests === before && m.views.size === count;
    titleConfig.preferences.autoFetchStashTitle = true;
    titles.resolveTitle("title");
    titles.resolveTitle("title");
    await wait(400);
    result.titleNoWebContents =
      m.views.size === count &&
      requests === before + 1 &&
      titleConfig.pageStash[0].title === "Static title";
    clearTimeout(watchdog);
    const pass = Object.values(result).every(Boolean);
    writeFileSync(
      "resource-policies-results.json",
      JSON.stringify({ ...result, pass }, null, 2),
    );
    console.log(JSON.stringify({ ...result, pass }));
    m.destroy();
    w.destroy();
    server.close();
    app.exit(pass ? 0 : 1);
  } catch (error) {
    console.error(error);
    m.destroy();
    w.destroy();
    server.close();
    app.exit(1);
  }
});
