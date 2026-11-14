import { app, BrowserWindow, WebContentsView } from "electron";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
import { themePalettes, type ThemeName } from "../src/core/Theme";
const theme = (process.env.MVB_STARTUP_THEME ?? "black") as ThemeName;
app.setPath(
  "userData",
  app.getPath("temp") + "/mvb-startup-" + theme + "-" + Date.now(),
);
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
const pending: any[] = [];
const server = createServer((_q, r) => {
  r.writeHead(200, { "Content-Type": "text/html" });
  r.write(
    "<!doctype html><html><body><span>Loading</span><!--" +
      " ".repeat(8192) +
      " -->",
  );
  pending.push(r);
});
const colors: { color: string; at: number }[] = [];
const original = WebContentsView.prototype.setBackgroundColor;
WebContentsView.prototype.setBackgroundColor = function (color: string) {
  colors.push({ color, at: Date.now() });
  return original.call(this, color);
};
server.listen(0, "127.0.0.1", async () => {
  const c = defaults(),
    base = "http://127.0.0.1:" + (server.address() as any).port;
  c.preferences.theme = theme;
  c.masterMuted = true;
  c.session.pages = [newPage(base + "/1"), newPage(base + "/2")];
  c.session.pages[0]!.scale.mode = "responsive";
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(app.getPath("userData") + "/config.json", JSON.stringify(c));
  await import("./main");
  await app.whenReady();
  setTimeout(() => app.exit(2), 15000);
  await wait(1400);
  try {
    const w = BrowserWindow.getAllWindows().find(
      (w) => w.webContents.getTitle() === "MultiView Browser",
    )!;
    w.focus();
    w.webContents.setBackgroundThrottling(false);
    const views = w.contentView.children.filter(
      (v: any) => v.webContents && v.webContents !== w.webContents,
    ) as WebContentsView[];
    const pixels = [];
    for (const v of views) {
      const im = await v.webContents.capturePage(undefined, {
          stayAwake: true,
        }),
        sz = im.getSize(),
        buf = im.toBitmap(),
        i =
          (Math.floor(sz.height / 2) * sz.width + Math.floor(sz.width / 2)) * 4;
      pixels.push({ bgra: [...buf.subarray(i, i + 4)] });
    }
    const expected = themePalettes[theme].background.toLowerCase();
    const rgb = expected
        .slice(1)
        .match(/../g)!
        .map((x) => parseInt(x, 16)),
      bgra = [rgb[2], rgb[1], rgb[0], 255];
    const initialPass =
      views.length === 2 &&
      colors.length >= 2 &&
      colors.every((x) => x.color.toLowerCase() === expected) &&
      w.getBackgroundColor().toLowerCase() === expected &&
      pixels.every((p) => JSON.stringify(p.bgra) === JSON.stringify(bgra));
    const initialWindow = w.getBackgroundColor(),
      initialColors = colors.slice(),
      ids = views.map((v) => v.webContents.id),
      updates = [];
    for (const selected of ["gray", "black", "light", "dark"] as ThemeName[]) {
      await w.webContents.executeJavaScript(
        `window.browser.load().then(c=>{c.preferences.theme='${selected}';return window.browser.save(c)})`,
      );
      await wait(80);
      const color = themePalettes[selected].background,
        values = [];
      for (const v of views) {
        const image = await v.webContents.capturePage(undefined, {
            stayAwake: true,
          }),
          size = image.getSize(),
          b = image.toBitmap(),
          i =
            (Math.floor(size.height / 2) * size.width +
              Math.floor(size.width / 2)) *
            4;
        values.push([...b.subarray(i, i + 4)]);
      }
      const channels = color
          .slice(1)
          .match(/../g)!
          .map((x) => parseInt(x, 16)),
        expectedPixels = [channels[2], channels[1], channels[0], 255];
      updates.push({
        selected,
        values,
        pass:
          values.every(
            (v) => JSON.stringify(v) === JSON.stringify(expectedPixels),
          ) && w.getBackgroundColor().toLowerCase() === color,
      });
    }
    for (const r of pending)
      r.end(
        '<script>document.body.style.background="rgb(240,230,220)";window.fixtureReady=true</script>',
      );
    await wait(250);
    const authored = (
      await Promise.all(
        views.map((v) =>
          v.webContents.executeJavaScript(
            'window.fixtureReady===true&&getComputedStyle(document.body).backgroundColor==="rgb(240, 230, 220)"',
          ),
        ),
      )
    ).every(Boolean);
    const preserved =
      views.every((v, i) => v.webContents.id === ids[i]) &&
      pending.length === 2;
    const pass =
      initialPass && updates.every((x) => x.pass) && authored && preserved;

    writeFileSync(
      "startup-" + theme + "-diagnostic.json",
      JSON.stringify(
        {
          theme,
          expected,
          colors,
          initialColors,
          initialWindow,
          pixels,
          initialPass,
          updates,
          authored,
          preserved,
          pass,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        theme,
        initialPass,
        updates: updates.every((x) => x.pass),
        authored,
        preserved,
        pass,
      }),
    );
    await wait(300);
    app.exit(pass ? 0 : 1);
  } catch (e) {
    console.error(e instanceof Error ? e.name : "failure");
    app.exit(1);
  } finally {
    server.close();
  }
});
