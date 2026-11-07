import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
app.setPath("userData", app.getPath("temp") + "/mvb-exchange-" + Date.now());
const server = createServer((_q, r) => {
  r.setHeader("Content-Type", "text/html");
  r.end(
    '<input value="preserved"><script>window.identity=Math.random()</script>',
  );
});
server.listen(0, "127.0.0.1", () => {
  const config = defaults();
  const port = (server.address() as { port: number }).port;
  config.session.pages = [0, 1, 2].map((i) =>
    newPage("http://127.0.0.1:" + port + "/" + i),
  );
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(
    app.getPath("userData") + "/config.json",
    JSON.stringify(config),
  );
  void import("./main");
  app.whenReady().then(async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await wait(2500);
    try {
      const w = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getTitle() === "MultiView Browser",
      )!;
      const views = () =>
        w.contentView.children.filter(
          (v) => "webContents" in v,
        ) as Electron.WebContentsView[];
      const originals = await Promise.all(
        views().map(async (v) => ({
          id: v.webContents.id,
          identity: await v.webContents.executeJavaScript("window.identity"),
        })),
      );
      const cases = [];
      for (const [from, to] of [
        [1, 0],
        [0, 2],
        [1, 2],
        [2, 1],
      ]) {
        const before = await w.webContents.executeJavaScript(
          "window.browser.load()",
        );
        const source = before.session.pages[from].id;
        const expected =
          from === 0 || to === 0
            ? before.session.pages[to === 0 ? from : to].id
            : source;
        const index = config.session.pages.findIndex(
          (p: any) => p?.id === expected,
        );
        const target =
          views()[
            originals.findIndex((o) => o.id === views()[index].webContents.id)
          ];
        const id = target.webContents.id;
        await w.webContents.executeJavaScript(
          "window.browser.exchange(" +
            JSON.stringify(before) +
            "," +
            from +
            "," +
            to +
            ")",
        );
        await wait(650);
        cases.push({
          from,
          to,
          focused: target.webContents.isFocused(),
          sameInstance: target.webContents.id === id,
        });
      }
      // Exercise the real blank-slot double-click route, not just exchange IPC.
      const beforeEmpty = await w.webContents.executeJavaScript(
        "window.browser.load()",
      );
      const mainId = beforeEmpty.session.pages[0].id;
      const mainIndex = config.session.pages.findIndex((p) => p?.id === mainId);
      const movedView = views()[mainIndex];
      const originalId = movedView.webContents.id;
      await w.webContents.executeJavaScript(
        `document.querySelector('.pane[data-slot="3"] .web-area').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
      );
      await wait(650);
      const afterEmpty = await w.webContents.executeJavaScript(
        "window.browser.load()",
      );
      cases.push({
        from: 0,
        to: 3,
        focused: movedView.webContents.isFocused(),
        sameInstance:
          movedView.webContents.id === originalId &&
          afterEmpty.session.pages[0] === null &&
          afterEmpty.session.pages[3]?.id === mainId,
      });
      await w.webContents.executeJavaScript(
        `document.querySelector('.pane[data-slot="3"] .web-area').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`,
      );
      await wait(650);
      const afterReturn = await w.webContents.executeJavaScript(
        "window.browser.load()",
      );
      cases.push({
        from: 3,
        to: 0,
        focused: movedView.webContents.isFocused(),
        sameInstance:
          movedView.webContents.id === originalId &&
          afterReturn.session.pages[0]?.id === mainId &&
          afterReturn.session.pages[3] === null,
      });
      const preserved = await Promise.all(
        views().map(async (v) => {
          const old = originals.find((o) => o.id === v.webContents.id);
          return (
            !!old &&
            old.identity ===
              (await v.webContents.executeJavaScript("window.identity")) &&
            (await v.webContents.executeJavaScript(
              'document.querySelector("input").value',
            )) === "preserved"
          );
        }),
      );
      const result = {
        cases,
        preserved,
        pass:
          cases.every((c) => c.focused && c.sameInstance) &&
          preserved.every(Boolean),
      };
      writeFileSync(
        "exchange-smoke-results.json",
        JSON.stringify(result, null, 2),
      );
      app.exit(result.pass ? 0 : 1);
    } catch (e) {
      console.error(e);
      app.exit(1);
    } finally {
      server.close();
    }
  });
});
