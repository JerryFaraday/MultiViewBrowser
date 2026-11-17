import { artifactOutputPath } from "../../scripts/test-artifacts.mjs";
import { app, BrowserWindow, ipcMain, webContents } from "electron";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { defaults } from "../../src/core/WorkspaceManager";
import { newPage } from "../../src/core/model";
import { presets } from "../../src/core/LayoutManager";
import { BrowserManager } from "../../electron/BrowserManager";
const label = process.argv.includes("--after") ? "after" : "before";
const profile = mkdtempSync(join(tmpdir(), "mvb-perf-"));
app.setPath("userData", profile);
const fs = createRequire(join(process.cwd(), "package.json"))("node:fs");
let recording = false;
let stats: any;
const logFds = new Set<number>();
const reset = () =>
  (stats = {
    ipc: {},
    outgoing: {},
    bounds: 0,
    visible: 0,
    emulation: 0,
    configWrites: 0,
    logWrites: 0,
    configReads: 0,
    syncDiskMs: 0,
  });
reset();
const open = fs.openSync;
fs.openSync = (p: any, ...args: any[]) => {
  const fd = open(p, ...args);
  if (String(p).endsWith(".log")) logFds.add(fd);
  return fd;
};
for (const name of [
  "writeFileSync",
  "readFileSync",
  "copyFileSync",
  "renameSync",
]) {
  const original = fs[name];
  fs[name] = function (p: any, ...args: any[]) {
    const at = performance.now();
    try {
      return original(p, ...args);
    } finally {
      if (recording && String(p).startsWith(profile)) {
        stats.syncDiskMs += performance.now() - at;
        if (name === "renameSync") stats.configWrites++;
        if (name === "readFileSync") stats.configReads++;
      }
    }
  };
}
const syncWrite = fs.writeSync;
fs.writeSync = function (fd: number, ...args: any[]) {
  const at = performance.now();
  try {
    return syncWrite(fd, ...args);
  } finally {
    if (recording && logFds.has(fd)) {
      stats.logWrites++;
      stats.syncDiskMs += performance.now() - at;
    }
  }
};
const asyncWrite = fs.write;
fs.write = function (fd: number, ...args: any[]) {
  if (recording && logFds.has(fd)) stats.logWrites++;
  return asyncWrite(fd, ...args);
};
const rename = fs.promises.rename;
fs.promises.rename = async (...args: any[]) => {
  if (recording && String(args[0]).startsWith(profile)) stats.configWrites++;
  return rename(...args);
};
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = ((channel: string, listener: any) =>
  handle(channel, (...args: any[]) => {
    if (recording) stats.ipc[channel] = (stats.ipc[channel] ?? 0) + 1;
    return listener(...args);
  })) as typeof ipcMain.handle;
let manager: BrowserManager;
const instrumented = new WeakSet<object>();
const sync = BrowserManager.prototype.sync;
BrowserManager.prototype.sync = function (...args: Parameters<typeof sync>) {
  manager = this;
  const result = sync.apply(this, args);
  for (const v of this.views.values()) {
    if (instrumented.has(v)) continue;
    instrumented.add(v);
    for (const [obj, key, counter] of [
      [v, "setBounds", "bounds"],
      [v, "setVisible", "visible"],
      [v.webContents, "enableDeviceEmulation", "emulation"],
      [v.webContents, "disableDeviceEmulation", "emulation"],
    ] as const) {
      const original = (obj as any)[key].bind(obj);
      (obj as any)[key] = (...a: any[]) => {
        if (recording) stats[counter]++;
        return original(...a);
      };
    }
    const send = v.webContents.send.bind(v.webContents);
    v.webContents.send = (channel, ...a) => {
      if (recording)
        stats.outgoing[channel] = (stats.outgoing[channel] ?? 0) + 1;
      send(channel, ...a);
    };
  }
  return result;
};
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(`<!doctype html><title>Performance fixture</title><div id="changes"></div><canvas id="canvas" width="320" height="180"></canvas><video muted autoplay playsinline></video><script>
window.state=0;setInterval(()=>{const e=document.createElement('span');e.textContent=++window.state;document.querySelector('#changes').replaceChildren(e)},30);
${req.url?.includes("media") ? `const c=document.querySelector('canvas'),g=c.getContext('2d');setInterval(()=>{g.fillStyle='hsl('+window.state+',50%,50%)';g.fillRect(0,0,320,180)},33);document.querySelector('video').srcObject=c.captureStream(30);` : ""}
</script>`);
});
const wait = (n: number) => new Promise((r) => setTimeout(r, n));
async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port,
    base = "http://127.0.0.1:" + port;
  const c = defaults();
  c.masterMuted = true;
  c.preferences.startupWindow = "normal";
  c.session.pages = Array.from({ length: 4 }, () => newPage(base + "/idle"));
  writeFileSync(join(profile, "config.json"), JSON.stringify(c));
  await import("../../electron/main");
  await app.whenReady();
  await wait(1300);
  const w = BrowserWindow.getAllWindows().find(
      (w) => w.webContents.getTitle() === "MultiView Browser",
    )!,
    root = w.webContents;
  w.setSize(1400, 900);
  root.setBackgroundThrottling(false);
  const js = (s: string) => root.executeJavaScript(s);
  const load = () => js("window.browser.load()");
  const apply = async (body: string) => {
    await js(
      `window.browser.load().then(c=>{${body};return window.browser.save(c)})`,
    );
    root.reload();
    await wait(1000);
  };
  const results: any[] = [];
  async function measure(name: string, action?: () => Promise<unknown>) {
    await wait(350);
    reset();
    const loop = monitorEventLoopDelay({ resolution: 10 });
    loop.enable();
    app.getAppMetrics();
    recording = true;
    const first = manager!.views.values().next().value;
    let coverage = false;
    try {
      first?.webContents.debugger.attach("1.3");
      await first?.webContents.debugger.sendCommand("Profiler.enable");
      await first?.webContents.debugger.sendCommand(
        "Profiler.startPreciseCoverage",
        { callCount: true, detailed: false },
      );
      coverage = true;
    } catch {}
    const actionStart = performance.now();
    await action?.();
    const actionMs = performance.now() - actionStart;
    const samples: any[] = [];
    for (let i = 0; i < 3; i++) {
      await wait(1000);
      samples.push(app.getAppMetrics());
    }
    let mediaScans: number | null = null;
    if (coverage)
      try {
        const r = await first!.webContents.debugger.sendCommand(
          "Profiler.takePreciseCoverage",
        );
        mediaScans = r.result
          .filter((s: any) => s.url.includes("media-preload"))
          .flatMap((s: any) => s.functions)
          .filter((f: any) => f.functionName === "scan")
          .reduce((n: number, f: any) => n + f.ranges[0].count, 0);
        await first!.webContents.debugger.sendCommand(
          "Profiler.stopPreciseCoverage",
        );
        first!.webContents.debugger.detach();
      } catch {}
    recording = false;
    loop.disable();
    const metrics = samples.flat(),
      mean = (type: string) =>
        samples.reduce(
          (n, s) =>
            n +
            s
              .filter((p: any) => p.type === type)
              .reduce((sum: number, p: any) => sum + p.cpu.percentCPUUsage, 0),
          0,
        ) / samples.length;
    const ids = [...new Set(metrics.map((p: any) => p.pid))];
    let gpu: any = { available: false };
    try {
      const cmd = `$ids=@(${ids.join(",")});try{$v=@(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction Stop|Where-Object { $_.Name -match 'pid_([0-9]+)_' -and $ids -contains [int]$Matches[1] });[pscustomobject]@{available=$true;maxEnginePercent=($v|Measure-Object UtilizationPercentage -Maximum).Maximum}|ConvertTo-Json -Compress}catch{'{"available":false}'}`;
      const r = await promisify(execFile)(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", cmd],
        { windowsHide: true, timeout: 12000 },
      );
      gpu = JSON.parse(r.stdout.trim());
    } catch {}
    const result = {
      name,
      mainCpu: mean("Browser"),
      rendererCpu: mean("Tab"),
      gpuProcessCpu: mean("GPU"),
      workingSetMB:
        samples.reduce(
          (n, s) =>
            n +
            s.reduce(
              (sum: number, p: any) => sum + p.memory.workingSetSize / 1024,
              0,
            ),
          0,
        ) / samples.length,
      webContents: webContents.getAllWebContents().length,
      views: manager!.views.size,
      gpu,
      mediaScans,
      actionMs,
      eventLoopP95Ms: loop.percentile(95) / 1e6,
      ...stats,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }
  await measure("four-idle");
  await apply(
    `c.session.pages.forEach((p,i)=>{if(p)p.url=${JSON.stringify(base)}+(i<2?'/media-video':'/media-live')})`,
  );
  await measure("four-media");
  const max = presets.at(-1)!;
  const maxSlot = (t: any): number =>
    t.kind === "leaf" ? t.slot : Math.max(...t.children.map(maxSlot));
  await apply(
    `c.session.tree=${JSON.stringify(max.tree)};c.session.pages=Array.from({length:${maxSlot(max.tree) + 1}},(_,i)=>({...c.session.pages[0],id:crypto.randomUUID(),url:${JSON.stringify(base + "/idle")}}))`,
  );
  await measure("max-layout");
  await apply(
    `c.session.tree=${JSON.stringify(c.session.tree)};c.session.pages=c.session.pages.slice(0,4);c.pageStash=Array.from({length:20},()=>{const page={...c.session.pages[0],id:crypto.randomUUID()};return {id:page.id,url:page.url,title:'fixture',page}})`,
  );
  await measure("twenty-hot-stash");
  await apply("c.pageStash=[]");
  await measure("repeated-state-and-bounds", async () => {
    await load();
    for (let i = 0; i < 50; i++) {
      await js(`window.browser.load().then(c=>window.browser.save(c))`);
      manager!.bounds((manager as any).visibleBounds);
    }
  });
  await measure("zoom-switch", async () => {
    const ids = [...manager!.views.keys()];
    for (let i = 0; i < 20; i++) {
      manager!.changePageZoom(ids[i % ids.length], i % 2 ? "out" : "in");
      await wait(15);
    }
  });
  await measure("settings-toggle", async () => {
    for (let i = 0; i < 10; i++) {
      await js(`window.browser.settingsView(${i % 2 === 0},undefined)`);
      await wait(30);
    }
  });
  writeFileSync(
    artifactOutputPath("performance-" + label + "-results.json"),
    JSON.stringify(
      {
        label,
        fixture:
          "local DOM changes every 30ms; generated media streams; 3 one-second samples; one-view precise coverage; GPU counter after sampling",
        results,
      },
      null,
      2,
    ),
  );
  root.removeAllListeners("beforeunload");
  w.destroy();
  manager!.destroy();
  server.close();
  app.exit(0);
}
main().catch(() => {
  console.error("Performance fixture failed");
  server.close();
  app.exit(1);
});
