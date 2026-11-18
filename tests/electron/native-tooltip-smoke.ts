import { app, BrowserWindow } from "electron";
import { installNativeTooltipDismissal } from "../../electron/native-tooltip";
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
  owner.focus();
  owner.webContents.sendInputEvent({ type: "mouseMove", x: 50, y: 40 });
  await wait(1200);
  const before = await owner.webContents.executeJavaScript("window.leaves");
  other.show();
  other.focus();
  await wait(150);
  const after = await owner.webContents.executeJavaScript("window.leaves");
  owner.focus();
  owner.webContents.sendInputEvent({ type: "mouseMove", x: 50, y: 40 });
  await wait(50);
  const retained = await owner.webContents.executeJavaScript(
    'document.querySelector("button").title==="fixture tooltip"',
  );
  const result = {
    nativeLeaveDelivered: after > before,
    titleRetained: retained,
  };
  console.log(JSON.stringify(result));
  owner.destroy();
  other.destroy();
  app.exit(Object.values(result).every(Boolean) ? 0 : 1);
});
