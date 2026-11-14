import { SettingsIcon, categoryIcons } from "./SettingsIcon";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { normalizeUrl, type Config } from "../core/model";
import { SettingSwitch } from "./SettingSwitch";
import { accentPresets, type AccentName } from "../core/Accent";
import type { Preferences } from "../core/Preferences";
import version from "../../version.json";
type Props = {
  config: Config;
  edit: (fn: (c: Config) => void) => void;
  onImported: (c: Config) => void;
  favoritesEditor: ReactNode;
};
export function SettingsPanel({
  config: c,
  edit,
  onImported,
  favoritesEditor,
}: Props) {
  const [tab, setTab] = useState("常规"),
    [message, setMessage] = useState(""),
    [info, setInfo] = useState<Record<string, unknown>>({}),
    [scope, setScope] = useState("all"),
    [origin, setOrigin] = useState(""),
    [busy, setBusy] = useState(false);
  const p = c.preferences;
  const content = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (content.current) content.current.scrollTop = 0;
  }, [tab]);
  useEffect(() => {
    void window.browser
      .settingsAction("info")
      .then(setInfo)
      .catch(() => setMessage("运行信息暂不可用。"));
  }, []);
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    edit((d) => {
      d.preferences[key] = value;
    });
  const row = (label: string, control: ReactNode, hint?: string) => (
    <label className="setting-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {control}
    </label>
  );
  const select = <K extends keyof Preferences>(
    key: K,
    options: [Preferences[K], string][],
  ) => (
    <select
      aria-label={key}
      value={String(p[key])}
      onChange={(e) => {
        const value = options.find((x) => String(x[0]) === e.target.value)![0];
        update(key, value);
      }}
    >
      {options.map(([value, label]) => (
        <option key={String(value)} value={String(value)}>
          {label}
        </option>
      ))}
    </select>
  );
  const toggle = (key: "autoSaveSession" | "showGroupNames" | "tooltips") => (
    <SettingSwitch
      checked={p[key]}
      onChange={(value) => update(key, value)}
      label={
        {
          autoSaveSession: "关闭时自动保存会话",
          showGroupNames: "显示收藏分组名称",
          tooltips: "鼠标悬停提示",
        }[key]
      }
    />
  );
  const action = async (id: string) => {
    setBusy(true);
    try {
      await window.browser.save(c);
      const result = await window.browser.settingsAction(id);
      setMessage(String(result.message ?? ""));
    } catch {
      setMessage("操作未完成，请检查网络连接、配置文件或目录权限。");
    } finally {
      setBusy(false);
    }
  };
  const transfer = async (kind: string) => {
    setBusy(true);
    try {
      await window.browser.save(c);
      const value = await window.browser.transfer(kind, scope);
      if (value) onImported(value);
      setMessage(
        kind === "export"
          ? "导出对话框已完成。"
          : "导入对话框已完成；取消时不更改配置。",
      );
    } catch {
      setMessage("配置导入或导出未完成，请检查JSON格式及文件权限。");
    } finally {
      setBusy(false);
    }
  };
  const permissionOrigins = [
    ...new Set([
      ...p.permissions.map((r) => r.origin),
      ...(Array.isArray(info.origins)
        ? info.origins.filter(
            (x): x is string => typeof x === "string" && x.startsWith("https:"),
          )
        : []),
    ]),
  ];
  return (
    <div className="settings-system">
      <nav className="settings-tabs" aria-label="设置分类">
        {["常规", "网页浏览", "收藏栏", "外观", "数据与隐私", "关于与诊断"].map(
          (t) => (
            <button
              key={t}
              aria-pressed={tab === t}
              onClick={() => {
                setTab(t);
                setMessage("");
              }}
            >
              <SettingsIcon name={categoryIcons[t]} />
              <span>{t}</span>
            </button>
          ),
        )}
      </nav>
      <section ref={content} className="settings-content" aria-label={tab}>
        <div className="settings-content-inner">
          <h3>{tab}</h3>
          {tab === "常规" && (
            <>
              {row(
                "启动时窗口状态",
                select("startupWindow", [
                  ["maximized", "最大化"],
                  ["last", "上次状态"],
                  ["normal", "普通窗口"],
                ]),
                "仅影响启动，不改变内部主窗口放大和F11行为。",
              )}
              {row(
                "启动时恢复内容",
                select("startupContent", [
                  ["last", "上次会话"],
                  ["workspace", "指定工作区"],
                  ["blank", "空白工作区"],
                ]),
              )}
              {row(
                "默认工作区",
                <select
                  aria-label="默认工作区"
                  value={p.defaultWorkspace}
                  onChange={(e) => update("defaultWorkspace", e.target.value)}
                >
                  <option value="">未指定（启动时使用空白工作区）</option>
                  {p.defaultWorkspace &&
                    !c.workspaces.some((w) => w.id === p.defaultWorkspace) && (
                      <option value={p.defaultWorkspace}>
                        原工作区已删除（回退空白）
                      </option>
                    )}
                  {c.workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>,
                "仅“指定工作区”启动模式使用；不会自动覆盖命名工作区。",
              )}
              {row(
                "关闭时自动保存会话",
                toggle("autoSaveSession"),
                "开启时同时保留运行期间的会话恢复记录；关闭不影响偏好、收藏和手动保存工作区。",
              )}
              {row(
                "关闭软件前确认",
                select("confirmClose", [
                  ["never", "从不"],
                  ["multiple", "有多个页面时"],
                  ["always", "始终"],
                ]),
                "页面数包含暂存区。",
              )}
            </>
          )}
          {tab === "网页浏览" && (
            <>
              <p>
                以下默认值只用于新页面，已有页面、暂存实例与已保存工作区保持原设置。
              </p>
              {row(
                "添加网页默认网址",
                <input
                  key={p.newPageUrl}
                  aria-label="添加网页默认网址"
                  spellCheck={false}
                  autoComplete="off"
                  defaultValue={p.newPageUrl}
                  onBlur={(e) => {
                    try {
                      const value = normalizeUrl(e.target.value.trim());
                      update("newPageUrl", value);
                      setMessage("");
                    } catch {
                      e.target.value = p.newPageUrl;
                      setMessage("默认网址仅允许有效HTTP/HTTPS地址。");
                    }
                  }}
                />,
                "用于空窗口的添加网页入口；不改写收藏和链接打开的目标网址。",
              )}
              {row(
                "新页面默认逻辑分辨率",
                select("resolution", [
                  ["1080", "1920 × 1080"],
                  ["1440", "2560 × 1440"],
                  ["2160", "3840 × 2160"],
                ]),
              )}
              {row(
                "新页面默认缩放模式",
                select("scaleMode", [
                  ["auto", "固定比例适配（现有自动等比适配）"],
                  ["responsive", "原生响应式（兼容）"],
                ]),
                "固定逻辑视口按窗口等比适配；主窗口放大仍固定使用原有2K规则。",
              )}
              {row(
                "新页面默认网页缩放",
                <div>
                  <select
                    aria-label="默认网页缩放"
                    value={p.pageZoom === 1 ? "100" : "custom"}
                    onChange={(e) =>
                      update("pageZoom", e.target.value === "100" ? 1 : 1.1)
                    }
                  >
                    <option value="100">100%</option>
                    <option value="custom">自定义</option>
                  </select>
                  {p.pageZoom !== 1 && (
                    <input
                      key={p.pageZoom}
                      aria-label="自定义网页缩放百分比"
                      type="number"
                      min="25"
                      max="500"
                      defaultValue={Math.round(p.pageZoom * 100)}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (n >= 25 && n <= 500) update("pageZoom", n / 100);
                        else
                          e.target.value = String(Math.round(p.pageZoom * 100));
                      }}
                    />
                  )}
                </div>,
                "内核Page Zoom，范围25%–500%，与UI缩放独立。",
              )}
              {row(
                "加载失败自动重试",
                <div>
                  <SettingSwitch
                    label="加载失败自动重试"
                    checked={p.retryCount > 0}
                    onChange={(value) => update("retryCount", value ? 3 : 0)}
                  />
                  {p.retryCount > 0 && (
                    <input
                      key={p.retryCount}
                      aria-label="重试次数"
                      type="number"
                      min="1"
                      max="10"
                      defaultValue={p.retryCount}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isInteger(n) && n >= 1 && n <= 10)
                          update("retryCount", n);
                        else e.target.value = String(p.retryCount);
                      }}
                    />
                  )}
                </div>,
                "仅主文档加载失败重试；不重试用户取消导航，也不绕过验证码或站点HTTP错误。",
              )}
            </>
          )}
          {tab === "收藏栏" && (
            <>
              {row(
                "显示收藏栏",
                <SettingSwitch
                  label="显示收藏栏"
                  checked={c.bookmarksBar}
                  onChange={(value) =>
                    edit((d) => {
                      d.bookmarksBar = value;
                    })
                  }
                />,
              )}
              {row(
                "显示收藏分组名称",
                toggle("showGroupNames"),
                "分组顺序与分隔线保持现有规则。",
              )}
              {favoritesEditor}
            </>
          )}
          {tab === "外观" && (
            <>
              {row(
                "应用主题",
                select("theme", [
                  ["dark", "深蓝（Dark Navy）"],
                  ["gray", "深灰（Dark Gray）"],
                  ["black", "纯黑（Just Black）"],
                  ["light", "浅色（Light）"],
                ]),
                "只影响应用界面，不强制改变网站的主题。",
              )}
              {row(
                "UI缩放比例",
                select("uiScale", [
                  [0.9, "90%"],
                  [1, "100%"],
                  [1.1, "110%"],
                  [1.25, "125%"],
                ]),
                "缩放应用界面及原生浮窗；网页Page Zoom独立。",
              )}
              {row(
                "鼠标悬停提示",
                toggle("tooltips"),
                "控制文字工具提示，不关闭音量、缩放和暂存区的悬停操作面板。",
              )}
              {row(
                "强调色",
                select(
                  "accentColor",
                  (
                    Object.entries(accentPresets) as [
                      AccentName,
                      { name: string },
                    ][]
                  ).map(([key, value]) => [key, value.name]),
                ),
              )}
            </>
          )}
          {tab === "数据与隐私" && (
            <>
              <p>
                导出完整配置JSON：含网址、收藏/工作区名称、偏好和暂存，不含Cookie、网站存储或日志正文。请妥善保管。
              </p>
              <div className="settings-actions">
                <button disabled={busy} onClick={() => void transfer("export")}>
                  导出完整配置 JSON
                </button>
                <select
                  aria-label="导入覆盖范围"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                >
                  <option value="all">导入：全部配置</option>
                  <option value="preferences">导入：仅用户偏好</option>
                  <option value="favorites">导入：收藏与分组</option>
                  <option value="workspaces">导入：工作区与布局</option>
                </select>
                <button disabled={busy} onClick={() => void transfer("import")}>
                  导入 JSON…
                </button>
                <button onClick={() => void action("config-folder")}>
                  打开配置文件夹
                </button>
              </div>
              {row(
                "操作日志保留时间",
                select("logRetention", [
                  [0, "永久"],
                  [7, "7天"],
                  [30, "30天"],
                  [90, "90天"],
                ]),
                "改变为有限保留期需要确认，会清理超期历史文件；当前运行日志保留。",
              )}
              <div className="settings-actions">
                <button
                  disabled={busy}
                  onClick={() => void action("clear-logs")}
                >
                  清理历史日志…
                </button>
                <button
                  disabled={busy}
                  onClick={() => void action("clear-cache")}
                >
                  清理浏览器HTTP缓存…
                </button>
              </div>
              <h4>网站权限</h4>
              <p>
                仅管理HTTPS站点的摄像头、麦克风和通知。未配置及其他权限默认拒绝。撤销会提示重新加载相关页面，可能丢失页面输入；授权仍受操作系统权限和网站安全策略约束。
              </p>
              <div className="settings-actions">
                <input
                  aria-label="权限站点"
                  placeholder="https://example.com"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                />
                <button
                  onClick={() => {
                    try {
                      const u = new URL(origin);
                      if (u.protocol !== "https:") throw Error();
                      if (!p.permissions.some((x) => x.origin === u.origin))
                        update("permissions", [
                          ...p.permissions,
                          {
                            origin: u.origin,
                            camera: false,
                            microphone: false,
                            notifications: false,
                          },
                        ]);
                      setOrigin("");
                    } catch {
                      setMessage("请输入有效的HTTPS站点地址。");
                    }
                  }}
                >
                  添加站点
                </button>
              </div>
              {permissionOrigins.map((site) => {
                const rule = p.permissions.find((x) => x.origin === site) ?? {
                  origin: site,
                  camera: false,
                  microphone: false,
                  notifications: false,
                };
                return (
                  <div className="permission-row" key={site}>
                    <span>{site}</span>
                    {(["camera", "microphone", "notifications"] as const).map(
                      (key, i) => (
                        <label key={key}>
                          <SettingSwitch
                            label={site + " " + ["摄像头", "麦克风", "通知"][i]}
                            checked={rule[key]}
                            onChange={(value) =>
                              update("permissions", [
                                ...p.permissions.filter(
                                  (x) => x.origin !== site,
                                ),
                                { ...rule, [key]: value },
                              ])
                            }
                          />
                          {["摄像头", "麦克风", "通知"][i]}
                        </label>
                      ),
                    )}
                  </div>
                );
              })}
            </>
          )}
          {tab === "关于与诊断" && (
            <>
              <h4>MultiView Browser · V{version.version}</h4>
              <p>
                Electron {String(info.electron ?? "—")}
                <br />
                Chromium {String(info.chromium ?? "—")}
                <br />
                Node.js {String(info.node ?? "—")}
              </p>
              <div className="settings-actions">
                {[
                  ["updates", "检查更新"],
                  ["releases", "打开发布页"],
                  ["log-folder", "打开日志文件夹"],
                  ["diagnostics", "导出脱敏诊断报告"],
                  ["repository", "GitHub 仓库"],
                  ["manual", "使用手册"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    disabled={busy}
                    onClick={() => void action(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p>
                检查GitHub正式Releases，不自动下载或安装。诊断报告不含网址、名称、用户目录、Cookie、凭据及日志正文。
              </p>
            </>
          )}
          <p className="settings-message" role="status">
            {message}
          </p>
        </div>
      </section>
    </div>
  );
}
