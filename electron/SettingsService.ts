import { pruneLogs } from "./LogRetention";
import {
  app,
  BrowserWindow,
  dialog,
  shell,
  session,
  nativeTheme,
  net,
  ipcMain,
} from "electron";
import { writeFileSync, mkdirSync } from "node:fs";
import { z } from "zod";
import version from "../version.json";
import { operationLogLocation, logOperation } from "./OperationLogger";
import type { Config } from "../src/core/model";
import type { Preferences } from "../src/core/Preferences";
import type { BrowserManager } from "./BrowserManager";
export const repository = "https://github.com/JerryFaraday/MultiViewBrowser";
const lightCSS = `:root{color-scheme:light!important;color:#243247!important;background:#f3f6fb!important}body{color:#243247!important} .app,main,.web-area{background:#f3f6fb!important}.toolbar,.bookmarks-bar,.pane-bar,.side-title,.side,.modal,aside,footer,.status{background:#e8eef6!important;color:#243247!important;border-color:#bcc9da!important}button{background:#e2eaf5!important;color:#26364a!important;border-color:#b9c8dc!important}button:hover,button:focus{background:#cedbef!important;color:#17283f!important}button[aria-pressed=true]{background:#bfd0ea!important}input,select,textarea{background:#fbfdff!important;color:#243247!important;border-color:#b9c8dc!important}.modal-cover{background:#32445a66!important}.bookmark-empty,p,small{color:#56667c!important}.stash-count{background:#c9d9ed!important;color:#253c5a!important}.favorite,.saved,.pane{border-color:#bfccdb!important}`;
export class SettingsService {
  private styles = new Map<number, string>();
  private generations = new Map<number, number>();
  private previous = "";
  constructor(
    private window: BrowserWindow,
    private read: () => Config,
    private manager: BrowserManager,
  ) {
    window.webContents.setZoomMode("isolated");
    const observe = (w: BrowserWindow) => {
      w.webContents.on("did-finish-load", () => void this.style(w));
      w.on("closed", () => {
        this.styles.delete(w.id);
        this.generations.delete(w.id);
      });
    };
    observe(window);
    app.on("browser-window-created", (_e, w) => observe(w));
    nativeTheme.on("updated", () => this.apply(true));
    ipcMain.handle("settings-action", async (e, raw) => {
      if (
        e.sender !== window.webContents ||
        e.senderFrame !== window.webContents.mainFrame
      )
        throw Error("拒绝来源");
      const action = z
        .enum([
          "info",
          "config-folder",
          "log-folder",
          "clear-logs",
          "clear-cache",
          "diagnostics",
          "updates",
          "releases",
          "repository",
          "manual",
        ])
        .parse(raw);
      try {
        return await this.action(action);
      } catch {
        return { message: "操作未完成，请检查网络连接或目录权限后重试。" };
      }
    });
  }
  confirmPreferences(before: Preferences, next: Preferences) {
    if (
      before.logRetention !== next.logRetention &&
      next.logRetention !== 0 &&
      !this.confirm(
        `将自动删除超过${next.logRetention}天的历史操作日志，当前日志保留。继续？`,
      )
    )
      next.logRetention = before.logRetention;
    const revoked = before.permissions.filter((old) => {
      const rule = next.permissions.find((p) => p.origin === old.origin);
      return (
        (old.camera && !rule?.camera) ||
        (old.microphone && !rule?.microphone) ||
        (old.notifications && !rule?.notifications)
      );
    });
    if (
      revoked.length &&
      !this.confirm(
        "撤销站点权限需要重新加载相关网页，以终止已有的媒体或通知会话。网页未保存的输入可能丢失；Cookie、工作区及其他网页不受影响。继续？",
      )
    )
      next.permissions = before.permissions;
    return revoked
      .filter((old) => {
        const rule = next.permissions.find((p) => p.origin === old.origin);
        return (
          (old.camera && !rule?.camera) ||
          (old.microphone && !rule?.microphone) ||
          (old.notifications && !rule?.notifications)
        );
      })
      .map((x) => x.origin);
  }
  private confirm(message: string) {
    return (
      dialog.showMessageBoxSync(this.window, {
        type: "question",
        message,
        buttons: ["取消", "继续"],
        defaultId: 0,
        cancelId: 0,
      }) === 1
    );
  }
  apply(force = false) {
    const p = this.read().preferences;
    this.manager.setPreferences(p);
    const key = JSON.stringify(p);
    if (!force && key === this.previous) return;
    this.previous = key;
    for (const w of BrowserWindow.getAllWindows()) void this.style(w);
    if (p.logRetention) {
      const logs = operationLogLocation();
      if (logs) pruneLogs(logs.folder, logs.file, p.logRetention);
    }
  }
  private async style(w: BrowserWindow) {
    if (w.isDestroyed() || w.webContents.isDestroyed()) return;
    const url = w.webContents.getURL();
    if (
      !url.startsWith("file:") &&
      !url.startsWith("data:") &&
      !url.startsWith("http://localhost:")
    )
      return;
    if (w.webContents.getTitle() === "窗口交换交互层") return;
    const generation = (this.generations.get(w.id) ?? 0) + 1;
    this.generations.set(w.id, generation);
    const p = this.read().preferences,
      light =
        p.theme === "light" ||
        (p.theme === "system" && !nativeTheme.shouldUseDarkColors),
      color = { blue: "rgb(0, 135, 189)", teal: "#148c83", violet: "#8070c7" }[
        p.accent
      ];
    try {
      w.webContents.setZoomMode("isolated");
      if (Math.abs(w.webContents.getZoomFactor() - p.uiScale) > 0.001)
        w.webContents.setZoomFactor(p.uiScale);
      const old = this.styles.get(w.id);
      if (old) await w.webContents.removeInsertedCSS(old).catch(() => {});
      if (this.generations.get(w.id) !== generation) return;
      const css =
        (light
          ? lightCSS +
            (w !== this.window
              ? w.webContents.getTitle() === "网页缩放比例"
                ? "body{background:transparent!important}#zoom{background:#e8eef6!important;color:#243247!important;border-color:#b9c8dc!important}"
                : "body{background:#e8eef6!important}"
              : "")
          : "") +
        (p.accent !== "blue"
          ? `input[type=range]{accent-color:${color}!important}.pane-bar .audio-toggle.audible{color:${color}!important}`
          : "");
      const inserted = await w.webContents.insertCSS(
        css || "/* default appearance */",
      );
      if (this.generations.get(w.id) !== generation) {
        await w.webContents.removeInsertedCSS(inserted).catch(() => {});
        return;
      }
      this.styles.set(w.id, inserted);
      await w.webContents.executeJavaScript(
        `(()=>{window.__tooltipObserver?.disconnect();const enabled=${p.tooltips};const sync=()=>{for(const el of document.querySelectorAll(enabled?'[data-hidden-title]':'[title]')){if(enabled){el.title=el.dataset.hiddenTitle;delete el.dataset.hiddenTitle;}else{el.dataset.hiddenTitle=el.title;el.removeAttribute('title');}}};sync();window.__tooltipObserver=new MutationObserver(sync);window.__tooltipObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['title']});})()`,
      );
    } catch {}
  }
  reloadOrigins(origins: string[]) {
    for (const view of this.manager.views.values()) {
      try {
        if (
          view.webContents.mainFrame.framesInSubtree.some((f) => {
            try {
              return origins.includes(new URL(f.url).origin);
            } catch {
              return false;
            }
          })
        )
          view.webContents.reload();
      } catch {}
    }
  }
  private async action(action: string): Promise<Record<string, unknown>> {
    const logs = operationLogLocation(),
      c = this.read();
    if (action === "info")
      return {
        version: "V" + version.version,
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        node: process.versions.node,
        origins: [
          ...new Set(
            c.session.pages.flatMap((p) => (p ? [new URL(p.url).origin] : [])),
          ),
        ],
      };
    logOperation("ui.click", {
      action: "settings.change",
      status: "requested",
    });
    if (action === "config-folder" || action === "log-folder") {
      const folder =
        action === "config-folder" ? app.getPath("userData") : logs?.folder;
      if (!folder) return { message: "日志目录尚不可用。" };
      mkdirSync(folder, { recursive: true });
      const error = await shell.openPath(folder);
      return { message: error ? "无法打开目录。" : "已打开目录。" };
    }
    if (action === "clear-logs") {
      if (!logs) return { message: "日志目录尚不可用。" };
      if (
        !this.confirm(
          "删除历史操作日志文件？当前运行日志保留。不会删除配置、Cookie、会话或工作区。",
        )
      )
        return { message: "已取消。" };
      return {
        message: `已清理${pruneLogs(logs.folder, logs.file, 0)}个历史日志文件。`,
      };
    }
    if (action === "clear-cache") {
      if (
        !this.confirm(
          "仅清理网页HTTP资源缓存，首次重新加载可能变慢。不删除Cookie、登录状态、网站本地存储、配置或工作区；当前页面不会刷新。继续？",
        )
      )
        return { message: "已取消。" };
      await session.fromPartition("persist:multiview").clearCache();
      return { message: "网页HTTP缓存已清理，Cookie和站点存储保留。" };
    }
    if (
      action === "repository" ||
      action === "releases" ||
      action === "manual"
    ) {
      const url =
        action === "manual"
          ? repository + "/blob/main/docs/USER_GUIDE.md"
          : repository + (action === "releases" ? "/releases" : "");
      await shell.openExternal(url);
      return { message: "已在系统浏览器打开。" };
    }
    if (action === "updates") {
      const response = await net.fetch(
        "https://api.github.com/repos/JerryFaraday/MultiViewBrowser/releases/latest",
        {
          signal: AbortSignal.timeout(10000),
          headers: { Accept: "application/vnd.github+json" },
        },
      );
      if (response.status === 404)
        return { message: "GitHub尚未发布正式Release。" };
      if (!response.ok) throw Error("Update check failed");
      const data = await response.json(),
        tag = String(data.tag_name ?? "");
      if (!/^v?\d+\.\d+\.\d+\.\d+$/i.test(tag))
        return { message: "Release版本格式无法自动比较，请打开发布页查看。" };
      const a = tag.replace(/^v/i, "").split(".").map(Number),
        b = version.version.split(".").map(Number);
      const diff = a.findIndex((n, i) => n !== b[i]);
      return {
        message:
          diff >= 0 && a[diff] > b[diff]
            ? `发现新版本V${a.join(".")}，请打开发布页查看。`
            : "当前版本不低于最新正式Release。",
      };
    }
    if (action === "diagnostics") {
      const report = {
        schema: 1,
        version: "V" + version.version,
        runtime: {
          electron: process.versions.electron,
          chromium: process.versions.chrome,
          node: process.versions.node,
          platform: process.platform,
          arch: process.arch,
        },
        counts: {
          pages: c.session.pages.filter(Boolean).length,
          stash: c.pageStash.length,
          workspaces: c.workspaces.length,
          favorites: c.favorites.length,
          permissionRules: c.preferences.permissions.length,
        },
        settings: {
          theme: c.preferences.theme,
          uiScale: c.preferences.uiScale,
          resolution: c.preferences.resolution,
          scaleMode: c.preferences.scaleMode,
          pageZoom: c.preferences.pageZoom,
          retryCount: c.preferences.retryCount,
          autoSaveSession: c.preferences.autoSaveSession,
          startupContent: c.preferences.startupContent,
        },
        logging: !!logs,
      };
      const result = await dialog.showSaveDialog(this.window, {
        defaultPath: "MultiViewBrowser-diagnostics.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (result.filePath)
        writeFileSync(result.filePath, JSON.stringify(report, null, 2));
      return {
        message: result.filePath
          ? "脱敏诊断报告已导出（不含网址、页面标题、名称、文件路径、凭据及日志正文）。"
          : "已取消。",
      };
    }
    return {};
  }
}
