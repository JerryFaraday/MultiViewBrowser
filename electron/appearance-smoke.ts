import { app, BrowserWindow, webContents, nativeTheme } from "electron";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
import { accentPresets } from "../src/core/Accent";
import { ConfigStore } from "./storage";
app.setPath(
  "userData",
  process.env.MVB_APPEARANCE_PROFILE ??
    app.getPath("temp") + "/mvb-appearance-" + Date.now(),
);
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
const server = createServer((_q, r) => {
  r.setHeader("Content-Type", "text/html");
  r.end(
    `<style>body{margin:0;background:rgb(245,235,225);color:rgb(30,40,50);height:2200px}</style><input value=retained><video autoplay muted style="width:40px;height:40px"></video><script>window.marker=Math.random();const c=document.createElement('canvas');c.width=c.height=40;const ctx=c.getContext('2d');function draw(){ctx.fillRect(0,0,40,40);requestAnimationFrame(draw)}draw();document.querySelector('video').srcObject=c.captureStream(20)</script>`,
  );
});
server.listen(0, "127.0.0.1", async () => {
  const restart = process.env.MVB_APPEARANCE_RESTART === "1";
  const c = restart
      ? JSON.parse(
          readFileSync(app.getPath("userData") + "/config.json", "utf8"),
        )
      : defaults(),
    base = "http://127.0.0.1:" + (server.address() as any).port;
  c.masterMuted = true;
  c.preferences.startupWindow = "normal";
  c.session.pages = restart
    ? c.session.pages.map((p: any, i: number) =>
        p ? { ...p, url: base + (i === 0 ? "/a" : "/b") } : null,
      )
    : [newPage(base + "/a"), newPage(base + "/b")];
  c.session.pages.forEach((p: any) => {
    p!.scale.mode = "responsive";
    p!.pageZoom = 1.25;
  });
  c.pageStash = [{ id: "fixture", url: base + "/parked", title: "fixture" }];
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(app.getPath("userData") + "/config.json", JSON.stringify(c));
  await import("./main");
  await app.whenReady();
  await wait(1500);
  const outcomes: any[] = [];
  let stage = 0;
  const watchdog = setTimeout(() => app.exit(1), 90000);
  try {
    const w = BrowserWindow.getAllWindows().find(
        (x) => x.webContents.getTitle() === "MultiView Browser",
      )!,
      root = w.webContents;
    stage = 1;
    w.setAlwaysOnTop(true);
    root.setBackgroundThrottling(false);
    if (restart) {
      const saved = await root.executeJavaScript("window.browser.load()");
      const appearance = await root.executeJavaScript(
        "({background:getComputedStyle(document.documentElement).backgroundColor,accent:getComputedStyle(document.querySelector('.master-volume input[type=range]')).accentColor,scheme:getComputedStyle(document.documentElement).colorScheme})",
      );
      const pass =
        saved.preferences.theme === "light" &&
        saved.preferences.accentColor === "violet" &&
        appearance.background === "rgb(243, 246, 251)" &&
        appearance.accent === "rgb(128, 112, 199)" &&
        appearance.scheme === "light" &&
        nativeTheme.themeSource === "light";
      writeFileSync(
        "appearance-restart-diagnostic.json",
        JSON.stringify({ appearance, pass }, null, 2),
      );
      console.log(JSON.stringify({ restart: true, pass }));
      app.exit(pass ? 0 : 1);
      return;
    }
    const pages = webContents
      .getAllWebContents()
      .filter((x) => x.getURL() === base + "/a" || x.getURL() === base + "/b");
    const before = await Promise.all(
      pages.map(async (p) => {
        await p.executeJavaScript("scrollTo(0,200)");
        return {
          id: p.id,
          marker: await p.executeJavaScript("window.marker"),
          zoom: p.getZoomFactor(),
          muted: p.isAudioMuted(),
        };
      }),
    );
    const pageId = c.session.pages[0]!.id;
    const popup = (title: string) =>
      BrowserWindow.getAllWindows().find(
        (x) => x.webContents.getTitle() === title,
      )!;
    const show = async (call: string, title: string) => {
      await root.executeJavaScript("window.browser." + call);
      await wait(100);
      const p = popup(title);
      p.webContents.setBackgroundThrottling(false);
      return p;
    };
    await root.executeJavaScript(
      "document.querySelector('.pane[data-slot=\"0\"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))",
    );
    await wait(100);
    await root.executeJavaScript(
      "Array.from(document.querySelectorAll('.toolbar>button')).find(b=>b.textContent==='设置').click()",
    );
    stage = 6;
    await wait(100);
    await root.executeJavaScript(
      "Array.from(document.querySelectorAll('.settings-tabs button')).find(b=>b.textContent==='外观').click()",
    );
    await wait(100);
    stage = 7;
    await root.executeJavaScript(
      `{const p=document.createElement('div');p.id='appearance-probes';p.innerHTML='<button class="primary">主要操作</button><input type="checkbox" checked><input type="radio" checked><input type="range" value="70"><input type="text" value="焦点预览">';document.querySelector('.settings-content-inner').append(p);}`,
    );
    const choose = async (key: string, value: string) => {
      stage = 8;
      await root.executeJavaScript(
        `{const el=document.querySelector('select[aria-label="${key}"]');el.value='${value}';el.dispatchEvent(new Event('change',{bubbles:true}));}`,
      );
      for (let i = 0; i < 40; i++) {
        const saved = await root.executeJavaScript("window.browser.load()");
        if (saved.preferences[key] === value) break;
        await wait(50);
      }
      await wait(80);
    };
    let remembered = "blue";
    for (const theme of ["dark", "gray", "black", "light"]) {
      await choose("theme", theme);
      const afterTheme = await root.executeJavaScript("window.browser.load()");
      const independentTheme =
        afterTheme.preferences.accentColor === remembered;
      for (const accent of ["blue", "teal", "violet"] as const) {
        await choose("accentColor", accent);
        remembered = accent;
        w.focus();
        root.focus();
        await wait(50);
        stage = 9;
        const state = await root.executeJavaScript(`(()=>{
          const style=e=>getComputedStyle(e),pick=s=>document.querySelector(s),rgb=c=>{const e=document.createElement('i');e.style.color=c;document.body.append(e);const r=style(e).color;e.remove();return r};
          const accent=rgb(getComputedStyle(document.documentElement).getPropertyValue('--accent'));
          const primary=style(pick('#appearance-probes .primary')),tab=style(pick('.settings-tabs button[aria-pressed=true]')),toggle=style(pick('.setting-switch[aria-checked=true]'));
          const field=pick('#appearance-probes input[type=text]');field.focus();const focus=style(field).outlineColor;
          return {accent,primary:primary.backgroundColor,primaryText:primary.color,nav:tab.backgroundColor,navText:tab.color,toggle:toggle.backgroundColor,focus,checks:[...document.querySelectorAll('#appearance-probes input:not([type=text])')].map(e=>style(e).accentColor),master:style(pick('.master-volume input[type=range]')).accentColor,
            scheme:style(document.documentElement).colorScheme,background:style(document.documentElement).backgroundColor,text:style(document.documentElement).color,toolbar:style(pick('.toolbar')).backgroundColor,settings:style(pick('.settings-page')).backgroundColor,
            rects:[pick('.settings-tabs'),pick('.settings-content'),pick('.setting-switch')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})};})()`);
        stage = 10;
        const volume = await show(
          `showVolume('${pageId}',{x:50,y:120,width:34,height:34})`,
          "窗口音量",
        );
        const volumeBounds = volume.getBounds();
        const v = {
          accent: await volume.webContents.executeJavaScript(
            "getComputedStyle(document.querySelector('input')).accentColor",
          ),
          bg: "",
          text: "",
        };
        stage = 101;
        v.bg = await volume.webContents.executeJavaScript(
          "getComputedStyle(document.body).backgroundColor",
        );
        stage = 102;
        v.text = await volume.webContents.executeJavaScript(
          "getComputedStyle(document.body).color",
        );
        stage = 11;
        const scale = await show(
          `showScale('${pageId}',{x:100,y:120,width:34,height:34},false)`,
          "网页缩放",
        );
        const scaleBounds = scale.getBounds();
        const s = await scale.webContents.executeJavaScript(
          "({bg:getComputedStyle(document.body).backgroundColor,text:getComputedStyle(document.querySelector('select')).color,input:getComputedStyle(document.querySelector('select')).backgroundColor})",
        );
        stage = 12;
        const stash = await show(
          `showStash({x:150,y:80,width:180,height:30})`,
          "页面暂存区",
        );
        const stashBounds = stash.getBounds();
        const parked = await stash.webContents.executeJavaScript(
          "({bg:getComputedStyle(document.body).backgroundColor,text:getComputedStyle(document.querySelector('button')).color})",
        );
        const saved = await root.executeJavaScript("window.browser.load()");
        const expected = accentPresets[accent].color.startsWith("#")
          ? `rgb(${[1, 3, 5].map((i) => parseInt(accentPresets[accent].color.slice(i, i + 2), 16)).join(", ")})`
          : accentPresets[accent].color;
        const pass =
          independentTheme &&
          saved.preferences.theme === theme &&
          saved.preferences.accentColor === accent &&
          [
            state.accent,
            state.primary,
            state.nav,
            state.toggle,
            state.focus,
            state.master,
            v.accent,
            ...state.checks,
          ].every((x) => x === expected) &&
          nativeTheme.themeSource === (theme === "light" ? "light" : "dark");
        outcomes.push({
          theme,
          accent,
          state,
          volume: v,
          scale: s,
          stash: parked,
          popupBounds: [volumeBounds, scaleBounds, stashBounds],
          pass,
        });
        if (accent === "blue")
          try {
            await root.executeJavaScript(
              "document.getElementById('appearance-probes').hidden=true",
            );
            await wait(50);
            writeFileSync(
              `appearance-${theme}-smoke.png`,
              (await root.capturePage(undefined, { stayAwake: true })).toPNG(),
            );
          } catch {
          } finally {
            await root.executeJavaScript(
              "document.getElementById('appearance-probes').hidden=false",
            );
          }
      }
    }
    const restarted = new ConfigStore(app.getPath("userData")).load();
    const persisted =
      restarted.preferences.theme === "light" &&
      restarted.preferences.accentColor === "violet";
    const statePreserved = (
      await Promise.all(
        pages.map(
          async (p, i) =>
            p.id === before[i].id &&
            p.getZoomFactor() === before[i].zoom &&
            p.isAudioMuted() === before[i].muted &&
            (await p.executeJavaScript(
              `window.marker===${before[i].marker}&&scrollY===200&&getComputedStyle(document.body).backgroundColor==='rgb(245, 235, 225)'&&!document.querySelector('video').paused`,
            )),
        ),
      )
    ).every(Boolean);
    const geometry =
      outcomes.every(
        (x) =>
          JSON.stringify(x.state.rects) ===
          JSON.stringify(outcomes[0].state.rects),
      ) &&
      outcomes.every(
        (x) =>
          JSON.stringify(x.popupBounds) ===
          JSON.stringify(outcomes[0].popupBounds),
      );
    await root.executeJavaScript(
      "Promise.all([window.browser.hideVolume(),window.browser.hideScale(),window.browser.hideStash()])",
    );
    await wait(250);
    w.focus();
    root.focus();
    await root.executeJavaScript(
      "document.querySelector('.settings-back').click()",
    );
    await wait(200);
    const sameViews = pages.every((p, i) => p.id === before[i].id);
    for (
      let i = 0;
      i < 20 && !pages.find((p) => p.getURL() === base + "/a")!.isFocused();
      i++
    )
      await wait(50);
    const focusRestored = pages
      .find((p) => p.getURL() === base + "/a")!
      .isFocused();
    const surfaceIsolation = outcomes.every((x) => {
      const first = outcomes.find((y) => y.theme === x.theme);
      return (
        ["background", "toolbar", "settings", "text"].every(
          (key) => x.state[key] === first.state[key],
        ) &&
        x.volume.bg === first.volume.bg &&
        x.scale.input === first.scale.input &&
        x.stash.bg === first.stash.bg
      );
    });
    await root.executeJavaScript(
      `window.browser.beginDrag('${pageId}',Array.from(document.querySelectorAll('.pane')).map(el=>{const r=el.getBoundingClientRect();return {slot:Number(el.dataset.slot),rect:{x:r.x,y:r.y,width:r.width,height:r.height}}}))`,
    );
    await wait(100);
    const overlay = popup("窗口交换交互层");
    overlay.webContents.setBackgroundThrottling(false);
    const overlayStyle = await overlay.webContents.executeJavaScript(
      "({background:getComputedStyle(document.body).backgroundColor,border:getComputedStyle(document.querySelector('#highlight')).borderTopColor})",
    );
    const overlayImage = await overlay.webContents.capturePage(undefined, {
      stayAwake: true,
    });
    const overlayAlpha = overlayImage.toBitmap()[3];
    const overlayPreserved =
      overlayAlpha <= 2 && overlayStyle.border === "rgb(128, 112, 199)";
    await root.executeJavaScript("window.browser.endDrag()");
    const luminance = (value: string) => {
      const c = value
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          const n = v / 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        });
      return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    };
    const contrast = (a: string, b: string) => {
      const x = luminance(a),
        y = luminance(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const minimumContrast = Math.min(
      ...outcomes.flatMap((x) => [
        contrast(x.state.primaryText, x.state.primary),
        contrast(x.state.navText, x.state.nav),
        contrast(x.state.text, x.state.background),
        contrast(x.volume.text, x.volume.bg),
        contrast(x.scale.text, x.scale.input),
        contrast(x.stash.text, x.stash.bg),
      ]),
    );
    const pass =
      outcomes.every((x) => x.pass) &&
      persisted &&
      statePreserved &&
      geometry &&
      sameViews &&
      focusRestored &&
      minimumContrast >= 4.5 &&
      surfaceIsolation &&
      overlayPreserved;
    writeFileSync(
      "appearance-diagnostic.json",
      JSON.stringify(
        {
          outcomes,
          persisted,
          statePreserved,
          geometry,
          sameViews,
          focusRestored,
          minimumContrast,
          surfaceIsolation,
          overlayPreserved,
          overlayAlpha,
          pass,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        cases: outcomes.length,
        failed: outcomes
          .filter((x) => !x.pass)
          .map((x) => ({ theme: x.theme, accent: x.accent })),
        persisted,
        statePreserved,
        geometry,
        sameViews,
        focusRestored,
        minimumContrast,
        surfaceIsolation,
        overlayPreserved,
        pass,
      }),
    );
    app.exit(pass ? 0 : 1);
  } catch (error) {
    console.error(
      "Appearance diagnostic failed at stage",
      stage,
      error instanceof Error ? error.name : "unknown",
    );
    app.exit(1);
  } finally {
    clearTimeout(watchdog);
    server.close();
  }
});
