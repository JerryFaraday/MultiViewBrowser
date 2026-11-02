import { defaults } from "../src/core/WorkspaceManager";
import { app, BrowserWindow, webContents } from "electron";
import { writeFileSync, mkdirSync } from "node:fs";
app.setPath(
  "userData",
  app.getPath("temp") + "/multiview-ui-smoke-" + Date.now(),
);
const seed = defaults();
seed.groups = ["A", "B"];
seed.favorites = ["a", "b", "c"].map((id, i) => ({
  id,
  name: id,
  url: "https://example.com/" + id,
  group: i < 2 ? "A" : "B",
  note: "",
  created: new Date().toISOString(),
}));
mkdirSync(app.getPath("userData"), { recursive: true });
writeFileSync(app.getPath("userData") + "/config.json", JSON.stringify(seed));
void import("./main");
app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 2500));
  try {
    const w = BrowserWindow.getAllWindows().find(
      (v) => v.webContents.getTitle() === "MultiViewBrowser",
    )!;
    const emptyStartupWindows = BrowserWindow.getAllWindows().length;
    const initialFullscreen = w.isFullScreen();
    const initialMaximized = w.isMaximized();
    const result = await w.webContents.executeJavaScript(
      `({title:document.title,buttons:document.querySelectorAll('button').length,panes:document.querySelectorAll('.pane').length,bridge:!!window.browser})`,
    );
    await w.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('＋ 网页')).click()`,
    );
    await new Promise((r) => setTimeout(r, 2000));
    result.webContents = webContents.getAllWebContents().length;
    const area = await w.webContents.executeJavaScript(
      `(()=>{const r=document.querySelector('.web-area').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`,
    );
    const native = w.contentView.children.find(
      (v) => "webContents" in v && v.webContents !== w.webContents,
    )!;
    const nr = native.getBounds();
    result.borderClearance = {
      top: nr.y - area.y,
      left: nr.x - area.x,
      right: area.x + area.width - nr.x - nr.width,
      bottom: area.y + area.height - nr.y - nr.height,
    };
    const viewport = () =>
      (native as Electron.WebContentsView).webContents.executeJavaScript(
        `({width:innerWidth,height:innerHeight})`,
      );

    const pause = (ms = 250) => new Promise((r) => setTimeout(r, ms));
    const openScale = async () => {
      await w.webContents.executeJavaScript(
        `document.querySelector('[title="缩放设置"]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:document.body}))`,
      );
      await pause(350);
      return BrowserWindow.getAllWindows().find((v) =>
        v.webContents.getURL().endsWith("scale.html"),
      )!;
    };
    const initialViewport = await viewport();
    const beforePopup = JSON.stringify(native.getBounds());
    const scalePopup = await openScale();
    const resolutionMenu = await scalePopup.webContents.executeJavaScript(
      `(()=>{const el=document.querySelector('[aria-label="逻辑分辨率"]');return {value:el.value,options:[...el.options].map(o=>o.value)}})()`,
    );
    const popupGeometry = scalePopup.getBounds();
    const overlayOnly =
      native.getVisible() &&
      beforePopup === JSON.stringify(native.getBounds()) &&
      (await w.webContents.executeJavaScript(
        `!document.querySelector('.modal')`,
      ));
    writeFileSync(
      "scale-popup-smoke.png",
      (await scalePopup.webContents.capturePage()).toPNG(),
    );
    await w.webContents.executeJavaScript(`window.browser.hideScale()`);
    await scalePopup.webContents.executeJavaScript(
      `document.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))`,
    );
    await pause();
    const staysInside = scalePopup.isVisible();
    await scalePopup.webContents.executeJavaScript(
      `(()=>{const el=document.querySelector('#resolution');el.value='3840x2160';el.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await pause(400);
    const selectedViewport = await viewport();
    await scalePopup.webContents.executeJavaScript(
      `document.dispatchEvent(new MouseEvent('mouseleave'))`,
    );
    await pause();
    const hidesOutside = !scalePopup.isVisible();
    await w.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('.toolbar button')).find(b=>b.textContent==='放大主窗口').click()`,
    );
    await pause(400);
    const maximizedViewport = await viewport();
    const savedDuringMax = await w.webContents.executeJavaScript(
      `window.browser.load().then(c=>({width:c.session.pages[0].scale.width,height:c.session.pages[0].scale.height}))`,
    );
    await openScale();
    const maxMenu = await scalePopup.webContents.executeJavaScript(
      `(()=>{const el=document.querySelector('#resolution');return {value:el.value,disabled:el.disabled}})()`,
    );
    await w.webContents.executeJavaScript(
      `window.browser.hideScale();Array.from(document.querySelectorAll('.toolbar button')).find(b=>b.textContent==='恢复分屏').click()`,
    );
    await pause(400);
    const restoredViewport = await viewport();
    result.resolution = {
      initialViewport,
      resolutionMenu,
      selectedViewport,
      maximizedViewport,
      savedDuringMax,
      maxMenu,
      restoredViewport,
      popupGeometry,
      overlayOnly,
      staysInside,
      hidesOutside,
    };
    result.resolution.pass =
      initialViewport.width === 1920 &&
      initialViewport.height === 1080 &&
      resolutionMenu.options.join(",") === "1920x1080,2560x1440,3840x2160" &&
      selectedViewport.width === 3840 &&
      selectedViewport.height === 2160 &&
      maximizedViewport.width === 2560 &&
      maximizedViewport.height === 1440 &&
      savedDuringMax.width === 3840 &&
      restoredViewport.width === 3840 &&
      restoredViewport.height === 2160 &&
      maxMenu.value === "2560x1440" &&
      maxMenu.disabled &&
      Math.abs(popupGeometry.width - 300) <= 2 &&
      Math.abs(popupGeometry.height - 240) <= 2 &&
      overlayOnly &&
      staysInside &&
      hidesOutside;
    await openScale();
    await scalePopup.webContents.executeJavaScript(
      `(()=>{const el=document.querySelector('#resolution');el.value='1920x1080';el.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await pause(350);
    await w.webContents.executeJavaScript(`window.browser.hideScale()`);
    await pause();
    const beforeSelection = await w.webContents.executeJavaScript(
      `window.browser.load().then(c=>({audio:c.session.pages[0].audio,volume:c.session.pages[0].volume}))`,
    );
    await w.webContents.executeJavaScript(
      `(async()=>{const panes=document.querySelectorAll('.pane');for(let i=0;i<10;i++){panes[0].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));await new Promise(r=>setTimeout(r,20));panes[1].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));await new Promise(r=>setTimeout(r,20))}})()`,
    );
    const afterSelection = await w.webContents.executeJavaScript(
      `window.browser.load().then(c=>({audio:c.session.pages[0].audio,volume:c.session.pages[0].volume}))`,
    );
    result.selectionAudioUnchanged =
      JSON.stringify(beforeSelection) === JSON.stringify(afterSelection);
    const originalBounds = JSON.stringify(native.getBounds());
    await w.webContents.executeJavaScript(
      `document.querySelector('.handle').dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:new DataTransfer()}))`,
    );
    await new Promise((r) => setTimeout(r, 300));
    result.drag = await w.webContents.executeJavaScript(
      `({addButtons:document.querySelectorAll('.add-page').length,hints:document.querySelectorAll('.drop-hint').length,occupiedHints:document.querySelector('.pane').querySelector('.drop-hint')!==null,sliderColor:getComputedStyle(document.querySelector('.master-volume input')).accentColor,audioColor:getComputedStyle(document.querySelector('.audio-toggle.audible')).color})`,
    );
    result.drag.visible = native.getVisible();
    result.drag.sameBounds =
      originalBounds === JSON.stringify(native.getBounds());
    await w.webContents.executeJavaScript(
      `document.querySelector('.handle').dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:new DataTransfer()}))`,
    );
    await new Promise((r) => setTimeout(r, 100));
    result.panesAfter = await w.webContents.executeJavaScript(
      `document.querySelectorAll('.pane input').length`,
    );
    await w.webContents.executeJavaScript(
      `document.querySelector('.master-volume input').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));Array.from(document.querySelectorAll('.toolbar button')).find(b=>b.textContent==='收藏栏').click()`,
    );
    await new Promise((r) => setTimeout(r, 250));
    await w.webContents.executeJavaScript(
      `document.querySelector('.web-area').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
    );
    await new Promise((r) => setTimeout(r, 150));
    result.doubleClickMax = await w.webContents.executeJavaScript(
      `document.querySelectorAll('.pane').length`,
    );
    await w.webContents.executeJavaScript(
      `document.querySelector('.web-area').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
    );
    await new Promise((r) => setTimeout(r, 150));
    result.doubleClickRestore = await w.webContents.executeJavaScript(
      `document.querySelectorAll('.pane').length`,
    );
    result.refinements = await w.webContents.executeJavaScript(
      `({volume:document.querySelector('.master-volume output').textContent,bookmarks:Array.from(document.querySelectorAll('.bookmark button')).map(b=>b.textContent),separators:document.querySelectorAll('.bookmark-separator').length})`,
    );
    await w.webContents.executeJavaScript(
      `const dt=new DataTransfer();dt.setData('application/x-mvb-favorite','b');const el=document.querySelectorAll('.bookmark')[0],r=el.getBoundingClientRect();el.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt,clientX:r.x+1,clientY:r.y+1}));`,
    );
    await new Promise((r) => setTimeout(r, 250));
    result.reordered = await w.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('.bookmark button')).map(b=>b.textContent)`,
    );
    await w.webContents.executeJavaScript(
      `document.querySelector('.master-mute').click();Array.from(document.querySelectorAll('.toolbar button')).find(b=>b.textContent==='放大主窗口').click()`,
    );
    await new Promise((r) => setTimeout(r, 250));
    result.maximize = await w.webContents.executeJavaScript(
      `({panes:document.querySelectorAll('.pane').length,muted:document.querySelector('.master-mute').getAttribute('aria-pressed'),volume:document.querySelector('.master-volume output').textContent})`,
    );
    await w.webContents.executeJavaScript(
      `document.querySelector('.master-mute').click();Array.from(document.querySelectorAll('.toolbar button')).find(b=>b.textContent==='恢复分屏').click();`,
    );
    await new Promise((r) => setTimeout(r, 250));
    await w.webContents.executeJavaScript(
      `document.querySelector('.audio-toggle').dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:document.body}))`,
    );
    await new Promise((r) => setTimeout(r, 100));
    const pop = BrowserWindow.getAllWindows().find((v) =>
      v.webContents.getURL().endsWith("volume.html"),
    )!;
    result.pageSlider = await pop.webContents.executeJavaScript(
      `({step:document.querySelector('input').step,direction:getComputedStyle(document.querySelector('input')).writingMode,panes:4,accent:getComputedStyle(document.querySelector('input')).accentColor})`,
    );
    const button = await w.webContents.executeJavaScript(
      `(()=>{const r=document.querySelector('.audio-toggle').getBoundingClientRect();return {x:r.x,width:r.width,webHeight:document.querySelector('.web-area').getBoundingClientRect().height,handles:Array.from(document.querySelectorAll('.handle')).map(e=>e.textContent)}})()`,
    );
    result.nativePopup = {
      width: pop.getBounds().width,
      buttonWidth: button.width,
      aligned:
        Math.abs(pop.getBounds().x - w.getContentBounds().x - button.x) < 1,
      handles: button.handles,
    };
    await w.webContents.executeJavaScript(`window.browser.hideVolume()`);
    await new Promise((r) => setTimeout(r, 100));
    await w.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('布局')).click()`,
    );
    await new Promise((r) => setTimeout(r, 500));
    result.volume = await w.webContents.executeJavaScript(
      `({max:document.querySelector('.master-volume input').max,value:document.querySelector('.master-volume input').value,icons:document.querySelectorAll('.audio-toggle svg').length,handleWidth:document.querySelector('.handle').getBoundingClientRect().width})`,
    );
    result.presets = await w.webContents.executeJavaScript(
      `document.querySelectorAll('.preset-grid>button').length`,
    );
    await w.webContents.executeJavaScript(
      `document.querySelector('.modal-title button').click();Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('收藏夹')).click()`,
    );
    await new Promise((r) => setTimeout(r, 150));
    await w.webContents.executeJavaScript(
      `document.querySelector('.side-title button').click()`,
    );
    await new Promise((r) => setTimeout(r, 300));
    result.favoriteForm = await w.webContents.executeJavaScript(
      `({inputs:document.querySelectorAll('.favorite-editor input').length,notes:document.querySelectorAll('.favorite-editor textarea').length,save:document.querySelector('.favorite-editor [type=submit]').textContent})`,
    );
    try {
      writeFileSync(
        "ui-smoke.png",
        (await w.webContents.capturePage()).toPNG(),
      );
    } catch (e) {
      result.captureError = String(e);
    }
    result.emptyStartupWindows = emptyStartupWindows;
    result.initialFullscreen = initialFullscreen;
    result.initialMaximized = initialMaximized;
    result.pass =
      result.selectionAudioUnchanged &&
      emptyStartupWindows === 1 &&
      initialMaximized &&
      !initialFullscreen &&
      result.doubleClickMax === 1 &&
      result.doubleClickRestore === 4 &&
      result.drag.visible &&
      result.drag.sameBounds &&
      result.resolution.pass &&
      result.drag.addButtons === 0 &&
      result.drag.hints === 3 &&
      !result.drag.occupiedHints &&
      result.drag.sliderColor === "rgb(0, 135, 189)" &&
      result.drag.audioColor === "rgb(41, 182, 255)" &&
      result.pageSlider.accent === "rgb(0, 135, 189)" &&
      Object.values(result.borderClearance).every((v) => (v as number) >= 2) &&
      result.bridge &&
      result.panes === 4 &&
      result.webContents >= 2 &&
      result.presets === 16 &&
      result.volume.max === "150" &&
      result.volume.icons >= 1 &&
      result.volume.handleWidth >= 60 &&
      result.favoriteForm.inputs === 3 &&
      result.favoriteForm.notes === 1 &&
      result.maximize.panes === 1 &&
      result.maximize.muted === "true" &&
      result.maximize.volume === "105%" &&
      result.pageSlider.step === "25" &&
      result.pageSlider.direction === "vertical-lr" &&
      result.pageSlider.panes === 4 &&
      result.nativePopup.aligned &&
      result.nativePopup.width === result.nativePopup.buttonWidth &&
      result.nativePopup.handles.join(",") === "主,2,3,4" &&
      result.refinements.volume === "105%" &&
      result.refinements.separators === 1 &&
      result.reordered.join(",") === "b,a,c";
    writeFileSync("ui-smoke-results.json", JSON.stringify(result, null, 2));
    app.exit(result.pass ? 0 : 1);
  } catch (e) {
    writeFileSync("ui-smoke-results.json", String(e));
    app.exit(1);
  }
});
