import { app, BrowserWindow, nativeImage } from "electron";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
import { BrowserManager } from "./BrowserManager";
import { presets } from "../src/core/LayoutManager";
app.setPath("userData", app.getPath("temp") + "/mvb-transition-" + Date.now());
const trace: Record<string, unknown>[] = [],
  stamp = (phase: string, details: Record<string, unknown> = {}) =>
    trace.push({ time: Date.now(), phase, ...details });
let manager: BrowserManager;
const originalBounds = BrowserManager.prototype.bounds;
BrowserManager.prototype.bounds = function (items) {
  manager = this;
  stamp("native-layout", {
    count: items.length,
    width: items[0]?.rect.width,
    height: items[0]?.rect.height,
    logical: items[0]?.scale.width,
  });
  for (const view of this.views.values()) {
    const wc = view.webContents as any,
      v = view as any;
    if (v.instrumented) continue;
    v.instrumented = true;
    const bounds = view.setBounds.bind(view),
      emulate = wc.enableDeviceEmulation.bind(wc),
      zoom = wc.setZoomFactor.bind(wc);
    v.setBounds = (r: any) => {
      stamp("set-bounds", { width: r.width, height: r.height });
      return bounds(r);
    };
    wc.enableDeviceEmulation = (p: any) => {
      stamp("viewport", {
        width: p.viewSize.width,
        height: p.viewSize.height,
        scale: p.scale,
      });
      return emulate(p);
    };
    wc.setZoomFactor = (factor: number) => {
      stamp("zoom", { factor });
      return zoom(factor);
    };
  }
  const result = originalBounds.call(this, items);
  stamp("native-layout-end");
  return result;
};
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
const server = createServer((_q, r) => {
  r.setHeader("Content-Type", "text/html");
  r.end(
    `<style>body{margin:0;background:rgb(20,40,80)}@media(min-width:2200px){body{background:rgb(80,40,20)}}@media(min-width:3000px){body{background:rgb(20,80,40)}}video{width:160px;height:90px}i{position:fixed;right:0;bottom:0;width:40px;height:40px;background:magenta}</style><video autoplay muted playsinline></video><i></i><script>const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const context=canvas.getContext('2d');let n=0;function draw(){context.fillStyle=n++%2?'#aaa':'#ddd';context.fillRect(0,0,160,90);requestAnimationFrame(draw)}draw();document.querySelector('video').srcObject=canvas.captureStream(30);</script>`,
  );
});
server.listen(0, "127.0.0.1", async () => {
  const url =
      process.env.MVB_RESIZE_URL ??
      "http://127.0.0.1:" + (server.address() as any).port,
    c = defaults();
  c.session.pages = [newPage(url)];
  c.masterMuted = true;
  const preset = presets[Number(process.env.MVB_LAYOUT_INDEX ?? 7)]!;
  c.session.tree = structuredClone(preset.tree);
  c.session.layoutId = preset.id;
  c.session.pages[0]!.scale.width = Number(
    process.env.MVB_LOGICAL_WIDTH ?? 1920,
  );
  c.session.pages[0]!.scale.height = Math.round(
    (c.session.pages[0]!.scale.width * 9) / 16,
  );
  c.session.pages[0]!.pageZoom = Number(process.env.MVB_PAGE_ZOOM ?? 1);
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(app.getPath("userData") + "/config.json", JSON.stringify(c));
  await import("./main");
  await app.whenReady();
  await wait(process.env.MVB_RESIZE_URL ? 18000 : 1500);
  try {
    const w = BrowserWindow.getAllWindows().find(
        (x) => x.webContents.getTitle() === "MultiView Browser",
      )!,
      root = w.webContents,
      page = manager!.views.get(c.session.pages[0]!.id)!.webContents;
    const identity = page.id;
    const baseline = process.env.MVB_DISABLE_COMPAT === "1";
    if (baseline)
      await page.executeJavaScript(
        `document.getElementById('mvb-bilibili-collection-layout')?.remove()`,
      );
    const structure = await page.executeJavaScript(
      `({nodes:document.querySelectorAll('*').length,collection:document.querySelectorAll('.pod-item').length,playerCollection:document.querySelectorAll('.bpx-player-ctrl-eplist-multi-menu-item').length})`,
    );
    await page.executeJavaScript(
      `window.__resizeEvents=[];new PerformanceObserver(list=>list.getEntries().forEach(e=>__resizeEvents.push({time:performance.timeOrigin+e.startTime,phase:'longtask',duration:e.duration}))).observe({entryTypes:['longtask']});window.__resizeIdentity=Math.random();let previous='';function sample(){const video=document.querySelector('video'),player=document.querySelector('.bpx-player-container'),rect=player?.getBoundingClientRect();const state={width:innerWidth,height:innerHeight,playerW:rect?.width,playerH:rect?.height,videoW:video?.clientWidth,videoH:video?.clientHeight,mediaTime:video?.currentTime,paused:video?.paused};const key=JSON.stringify([state.width,state.height,state.playerW,state.playerH,state.videoW,state.videoH]);if(key!==previous){__resizeEvents.push({time:Date.now(),phase:'page-layout',...state});previous=key;}}setInterval(sample,20);addEventListener('resize',()=>__resizeEvents.push({time:Date.now(),phase:'page-resize',width:innerWidth,height:innerHeight}));sample();`,
    );
    const marker = await page.executeJavaScript("window.__resizeIdentity"),
      before = await page.executeJavaScript(
        '({time:document.querySelector("video")?.currentTime,paused:document.querySelector("video")?.paused})',
      );
    let navigations = 0;
    page.on("did-navigate", () => navigations++);
    await root.executeJavaScript(
      `window.__domResize=[];let lastRect='';function sampleRect(){const rect=document.querySelector('.web-area')?.getBoundingClientRect();if(!rect)return;const key=JSON.stringify([rect.width,rect.height]);if(key===lastRect)return;lastRect=key;__domResize.push({time:Date.now(),phase:'dom-container',width:rect.width,height:rect.height});}new ResizeObserver(sampleRect).observe(document.querySelector('main'));new MutationObserver(sampleRect).observe(document.querySelector('main'),{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});sampleRect();`,
    );
    const capture = process.env.MVB_CAPTURE === "1";
    if (capture)
      await page.executeJavaScript(`{
        const mark=document.createElement('style');mark.textContent='#mvb-paint-marker{position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;pointer-events:none;background:rgb(20,40,80)}@media(min-width:2200px){#mvb-paint-marker{background:rgb(80,40,20)}}';document.head.append(mark);
        const node=document.createElement('i');node.id='mvb-paint-marker';document.body.append(node);
      }`);
    page.debugger.attach("1.3");
    await page.debugger.sendCommand("Performance.enable");
    const metricsBefore = await page.debugger.sendCommand(
      "Performance.getMetrics",
    );
    let frames = 0;
    page.debugger.on("message", (_e, method, data) => {
      if (method !== "Page.screencastFrame") return;
      frames++;
      const im = nativeImage.createFromDataURL(
          "data:image/png;base64," + data.data,
        ),
        bitmap = im.toBitmap();
      stamp("compositor-frame", {
        producedMs: data.metadata.timestamp
          ? data.metadata.timestamp * 1000
          : undefined,
        width: im.getSize().width,
        height: im.getSize().height,
        red: bitmap[2],
        green: bitmap[1],
        blue: bitmap[0],
      });
      void page.debugger
        .sendCommand("Page.screencastFrameAck", { sessionId: data.sessionId })
        .catch(() => {});
    });
    if (capture)
      await page.debugger.sendCommand("Page.startScreencast", {
        format: "png",
        maxWidth: 512,
        maxHeight: 512,
        everyNthFrame: 1,
      });
    w.focus();
    page.focus();
    for (
      let index = 0;
      index < (process.env.MVB_LIST_ONLY === "1" ? 0 : 20);
      index++
    ) {
      stamp("toggle", { index });
      await root.executeJavaScript(
        `document.querySelector('[data-action=main-maximize]').click()`,
      );
      await wait(1350);
    }
    if (capture) await page.debugger.sendCommand("Page.stopScreencast");
    const metricsAfter = await page.debugger.sendCommand(
      "Performance.getMetrics",
    );
    const metrics = Object.fromEntries(
      metricsAfter.metrics
        .filter((m: any) =>
          [
            "LayoutDuration",
            "RecalcStyleDuration",
            "ScriptDuration",
            "TaskDuration",
            "LayoutCount",
          ].includes(m.name),
        )
        .map((m: any) => [
          m.name,
          m.value -
            (metricsBefore.metrics.find((b: any) => b.name === m.name)?.value ??
              0),
        ]),
    );
    page.debugger.detach();
    trace.push(
      ...(await page.executeJavaScript("window.__resizeEvents")),
      ...(await root.executeJavaScript("window.__domResize")),
    );
    trace.sort((a, b) => Number(a.time) - Number(b.time));
    if (process.env.MVB_LIST_ONLY === "1") await wait(100);
    const after = await page.executeJavaScript(
      '({time:document.querySelector("video")?.currentTime,paused:document.querySelector("video")?.paused,marker:window.__resizeIdentity})',
    );
    const latencies = trace
      .filter((x) => x.phase === "toggle")
      .map((t, index, toggles) => {
        const next = trace.find(
          (x) =>
            x.phase === "page-layout" &&
            Number(x.time) > Number(t.time) &&
            Number(x.time) <
              Number(toggles[index + 1]?.time ?? Number(t.time) + 1400),
        );
        return next ? Number(next.time) - Number(t.time) : null;
      });
    const frameLatencies = capture
      ? trace
          .filter((x) => x.phase === "toggle")
          .map((t) => {
            const red = Number(t.index) % 2 === 0 ? 80 : 20;
            const next = trace.find(
              (x) =>
                x.phase === "compositor-frame" &&
                Number(x.producedMs) > Number(t.time) &&
                x.red === red &&
                x.green === 40,
            );
            return next
              ? Math.round(Number(next.producedMs) - Number(t.time))
              : null;
          })
      : [];
    const result = {
      baseline,
      latencies,
      structure,
      metrics,
      frames,
      frameLatencies,
      identity: page.id === identity && after.marker === marker,
      navigations,
      playing:
        before.paused === false &&
        after.paused === false &&
        after.time > before.time,
      muted: page.isAudioMuted(),
      integrityPass:
        page.id === identity &&
        after.marker === marker &&
        navigations === 0 &&
        before.paused === false &&
        after.paused === false &&
        after.time > before.time &&
        page.isAudioMuted(),
    };
    if (process.env.MVB_LIST_CHECK === "1") {
      const compare = await page.executeJavaScript(`(async()=>{
        const style=document.getElementById('mvb-bilibili-collection-layout');
        const rows=[...document.querySelectorAll('.pod-item')];
        const menu=[...document.querySelectorAll('.bpx-player-ctrl-eplist-multi-menu-item')];
        const settle=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const snapshot=()=>({count:rows.length,menu:menu.length,scroll:rows[0]?.parentElement.scrollHeight,menuScroll:menu[0]?.parentElement.scrollHeight,heights:rows.map(e=>e.getBoundingClientRect().height)});
        if(style)style.disabled=true;await settle();const original=snapshot();
        if(style)style.disabled=false;await settle();const optimized=snapshot();
        const active=rows.map((e,i)=>e.matches('.active')||e.querySelector('.active')?i:-1).filter(i=>i>=0);
        const last=[...rows].reverse().find(e=>!e.matches('.active')&&!e.querySelector('.active'));
        last?.scrollIntoView({block:'center'});await settle();
        const rect=last?.getBoundingClientRect();
        window.__listClick=null;last?.addEventListener('click',e=>{window.__listClick={trusted:e.isTrusted};},{capture:true,once:true});
        return {count:rows.length,menu:menu.length,active,target:rows.indexOf(last),geometryEqual:JSON.stringify(original)===JSON.stringify(optimized),scroll:optimized.scroll,lastH:rect?.height,x:rect?rect.left+rect.width/2:0,y:rect?rect.top+rect.height/2:0,viewportW:innerWidth};
      })()`);
      (result as any).list = compare;
      if (compare.count) {
        const beforeClick = page.getURL();
        const view = manager!.views.get(c.session.pages[0]!.id)!;
        const factor = view.getBounds().width / compare.viewportW;
        page.focus();
        for (const type of ["mouseDown", "mouseUp"] as const)
          page.sendInputEvent({
            type,
            x: Math.round(compare.x * factor),
            y: Math.round(compare.y * factor),
            button: "left",
            clickCount: 1,
          });
        await wait(5000);
        (result as any).list.clickedNavigation = page.getURL() !== beforeClick;
        (result as any).list.pass =
          compare.geometryEqual && page.getURL() !== beforeClick;
      }
    }
    const tag = process.env.MVB_RESIZE_CASE ?? "local";
    if (!/^[a-z0-9-]+$/.test(tag)) throw Error("Invalid case");
    writeFileSync(
      "resize-" + tag + "-diagnostic.json",
      JSON.stringify({ result, trace }, null, 2),
    );
    console.log(JSON.stringify(result));
    app.exit(
      result.integrityPass &&
        (process.env.MVB_LIST_CHECK !== "1" || (result as any).list?.pass)
        ? 0
        : 1,
    );
  } catch {
    console.error("Resize diagnostic failed");
    app.exit(1);
  } finally {
    server.close();
  }
});
