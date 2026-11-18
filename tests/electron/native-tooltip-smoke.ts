import { app, BrowserWindow } from "electron";
import { installNativeTooltipDismissal } from "../../electron/native-tooltip";
import { installUITooltips } from "../../electron/ui-tooltip";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const owner = new BrowserWindow({ show: true, width: 500, height: 350 }),
    other = new BrowserWindow({ show: false, width: 300, height: 250 });
  installNativeTooltipDismissal(owner);
  await owner.loadURL(
    "data:text/html," +
      encodeURIComponent(
        '<button title="fixture tooltip" style="width:200px;height:80px">hover</button><script>window.leaves=0;document.addEventListener("mouseout",()=>window.leaves++)</script>',
      ),
  );
  await owner.webContents.executeJavaScript(
    `(${installUITooltips.toString()})(true)`,
  );
  owner.focus();
  await wait(100);
  owner.webContents.sendInputEvent({ type: "mouseMove", x: 50, y: 40 });
  await wait(1200);
  const displayed = await owner.webContents.executeJavaScript(
    '!document.querySelector("#mvb-ui-tooltip").hidden && document.querySelectorAll("[title]").length===0',
  );
  const before = await owner.webContents.executeJavaScript("window.leaves");
  other.show();
  other.focus();
  await wait(150);
  const hidden = await owner.webContents.executeJavaScript(
    'document.querySelector("#mvb-ui-tooltip").hidden',
  );
  const after = await owner.webContents.executeJavaScript("window.leaves");
  owner.focus();
  owner.webContents.sendInputEvent({ type: "mouseMove", x: 50, y: 40 });
  await wait(50);
  const retained = await owner.webContents.executeJavaScript(
    'document.querySelector("button").dataset.hiddenTitle==="fixture tooltip"',
  );
  const result = {
    displayed,
    hidden,
    nativeLeaveDelivered: after > before,
    titleRetained: retained,
  };
  await owner.webContents.executeJavaScript(
    `(${installUITooltips.toString()})(false)`,
  );
  owner.webContents.sendInputEvent({ type: "mouseMove", x: 55, y: 40 });
  await wait(450);
  const disabled = await owner.webContents.executeJavaScript(
    'document.querySelector("#mvb-ui-tooltip").hidden && document.querySelectorAll("[title]").length===0',
  );
  Object.assign(result, { disabled });
  console.log(JSON.stringify(result));
  owner.destroy();
  other.destroy();
  await wait(50);
  app.exit(Object.values(result).every(Boolean) ? 0 : 1);
});
