import { mergeConfig } from "./core/ConfigMerge";
import version from "../version.json";
import { viewBounds } from "./core/ViewBounds";
import { displayScale } from "./core/ScaleManager";
import { windowName, windowShortName } from "./core/WindowNames";
import { FavoritesList } from "./components/FavoritesList";
import { AudioIcon } from "./components/AudioIcon";
import { FavoriteEditor, type Favorite } from "./components/FavoriteEditor";
import { useEffect, useRef, useState } from "react";
import "./api";
import {
  type Config,
  type Page,
  type Tree,
  newPage,
  normalizeUrl,
} from "./core/model";
import { presets, slots } from "./core/LayoutManager";
import { isMuted, snapVolume, stepVolume } from "./core/AudioManager";
import { LayoutView, Thumbnail } from "./components/LayoutView";
function dragTargets(includeStash = true) {
  const result = Array.from(
    document.querySelectorAll<HTMLElement>(".pane"),
  ).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      slot: Number(el.dataset.slot),
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    };
  });
  const button = document.querySelector(".page-stash");
  if (includeStash && button) {
    const r = button.getBoundingClientRect();
    result.push({
      slot: -1,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    });
  }
  return result;
}
export function App() {
  const [config, setConfig] = useState<Config>(),
    [panel, setPanel] = useState(""),
    [side, setSide] = useState(false),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(0),
    [max, setMax] = useState<number | null>(null),
    [drag, setDrag] = useState(false),
    [target, setTarget] = useState<number | null>(null),
    [error, setError] = useState("");
  useEffect(
    () =>
      window.browser.onStashDrag((id, targets) => {
        setDrag(true);
        void window.browser.beginDrag(id, [...targets, ...dragTargets(false)]);
      }),
    [],
  );
  useEffect(() => {
    const align = () => {
      const bar = document.querySelector(".bookmarks-bar"),
        button = document.querySelector('.toolbar button[title^="放大主窗口"]');
      const last = document.querySelector(".toolbar > button:last-child");
      if (bar && button && last) {
        document.documentElement.style.setProperty(
          "--stash-width",
          last.getBoundingClientRect().right -
            button.getBoundingClientRect().left +
            "px",
        );
        document.documentElement.style.setProperty(
          "--stash-inset",
          Math.max(
            0,
            bar.getBoundingClientRect().right -
              10 -
              last.getBoundingClientRect().right,
          ) + "px",
        );
      }
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [config, max, side]);
  const areas = useRef(new Map<number, HTMLDivElement>()),
    current = useRef(config),
    currentMax = useRef(max),
    ready = useRef(false),
    acknowledged = useRef<Config | undefined>(undefined);
  current.current = config;
  currentMax.current = max;
  useEffect(
    () =>
      window.browser.onZoomShortcut((direction) => {
        const page = current.current?.session.pages[selected];
        if (page) void window.browser.zoomPage(page.id, direction).catch(fail);
      }),
    [selected],
  );
  const [favoriteDraft, setFavoriteDraft] = useState<Favorite>();
  const [question, setQuestion] = useState<{
    text: string;
    value: string;
    resolve: (v: string | null) => void;
  }>();
  const ask = (text: string, value = "") =>
    new Promise<string | null>((resolve) =>
      setQuestion({ text, value, resolve }),
    );
  const fail = (e: unknown) => {
    void window.browser.log("app.error", { status: "failed" });
    setError(String(e));
  };
  useEffect(() => {
    window.browser
      .load()
      .then((c) => {
        ready.current = true;
        if (c.revision < (acknowledged.current?.revision ?? -1)) return;
        acknowledged.current = c;
        setConfig(c);
      })
      .catch(fail);
    return window.browser.onPage((e) => {
      if (e.error) setError(e.error);
      setConfig((c) =>
        c
          ? {
              ...c,
              session: {
                ...c.session,
                pages: c.session.pages.map((p) =>
                  p?.id === e.id
                    ? {
                        ...p,
                        title: e.title || p.title,
                        url: e.url?.startsWith("http") ? e.url : p.url,
                      }
                    : p,
                ),
              },
            }
          : c,
      );
    });
  }, []);
  useEffect(() => {
    if (!config || !ready.current || config === acknowledged.current) return;
    const timer = setTimeout(
      () =>
        window.browser
          .save(config)
          .then((saved) => {
            if (saved.revision < (acknowledged.current?.revision ?? -1)) return;
            acknowledged.current = saved;
            setConfig((draft) =>
              draft === config
                ? saved
                : draft
                  ? mergeConfig(config, draft, saved)
                  : saved,
            );
            bounds();
          })
          .catch(fail),
      180,
    );
    return () => clearTimeout(timer);
  }, [config]);
  function bounds() {
    const c = current.current;
    if (!c) return;
    const items =
      panel || question || favoriteDraft
        ? []
        : [...areas.current].flatMap(([slot, el]) => {
            const p = c.session.pages[slot];
            if (!p || !el.isConnected) return [];
            const r = viewBounds(el.getBoundingClientRect(), {
              width: window.innerWidth,
              height: window.innerHeight,
            });
            return r
              ? [
                  {
                    id: p.id,
                    rect: r,
                    scale: displayScale(
                      p.scale,
                      currentMax.current === 0 && slot === 0,
                    ),
                  },
                ]
              : [];
          });
    void window.browser.bounds(items).catch(fail);
  }
  useEffect(() => {
    const obs = new ResizeObserver(bounds);
    obs.observe(document.body);
    for (const el of areas.current.values()) obs.observe(el);
    bounds();
    const timer = setTimeout(bounds, 250);
    window.addEventListener("resize", bounds);
    return () => {
      obs.disconnect();
      clearTimeout(timer);
      window.removeEventListener("resize", bounds);
    };
  }, [config, panel, side, max, question, favoriteDraft]);
  useEffect(() => {
    const flush = () => {
      if (current.current) void window.browser.save(current.current);
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);
  useEffect(() => {
    void window.browser.presentation(max !== null).catch(fail);
  }, [max]);
  useEffect(
    () =>
      window.browser.onSession((_session, saved) => {
        if (saved.revision < (acknowledged.current?.revision ?? -1)) return;
        const base = acknowledged.current;
        acknowledged.current = saved;
        setConfig((c) => (c && base ? mergeConfig(base, c, saved) : saved));
      }),
    [],
  );
  useEffect(
    () =>
      window.browser.onDragFinished(() => {
        setDrag(false);
        setTarget(null);
      }),
    [],
  );
  useEffect(
    () =>
      window.browser.onPageFocus((id) => {
        const slot = current.current?.session.pages.findIndex(
          (p) => p?.id === id,
        );
        if (slot !== undefined && slot >= 0) setSelected(slot);
      }),
    [],
  );
  if (!config)
    return <div className="loading">正在启动 MultiView Browser…{error}</div>;
  const c = config,
    s = c.session;
  const edit = (fn: (draft: Config) => void) =>
    setConfig((previous) => {
      if (!previous) return previous;
      const draft = structuredClone(previous);
      fn(draft);
      return draft;
    });
  const pageEdit = (slot: number, fn: (p: Page) => void) =>
    edit((d) => {
      if (d.session.pages[slot]) fn(d.session.pages[slot]);
    });
  function open(url: string, slot = selected) {
    try {
      const normalized = normalizeUrl(url);
      edit((d) => {
        while (d.session.pages.length <= slot) d.session.pages.push(null);
        const old = d.session.pages[slot];
        if (old) {
          old.url = normalized;
          old.title = "正在加载…";
        } else d.session.pages[slot] = newPage(normalized);
      });
      const p = s.pages[slot];
      if (p)
        void window.browser.navigate(p.id, "navigate", normalized).catch(fail);
    } catch (e) {
      fail(e);
    }
  }
  function add() {
    const empty = slots(s.tree).find((i) => !s.pages[i]);
    if (empty !== undefined) {
      open("https://live.bilibili.com", empty);
      return;
    }
    void window.browser.newPage("https://live.bilibili.com").catch(fail);
  }
  const apply = (tree: Tree, id: string) => {
    edit((d) => {
      d.session.tree = structuredClone(tree);
      d.session.layoutId = id;
    });
    setMax(null);
    setPanel("");
  };
  const reset = () => {
    const preset =
      presets.find((p) => p.id === s.layoutId) ||
      c.layouts.find((p) => p.id === s.layoutId);
    if (preset)
      edit((d) => {
        d.session.tree = structuredClone(preset.tree);
      });
  };
  const saveNamed = async (kind: "layouts" | "workspaces", id?: string) => {
    const old = c[kind].find((v) => v.id === id);
    const name = await ask(
      "名称",
      old?.name || "新" + (kind === "layouts" ? "布局" : "工作区"),
    );
    if (!name?.trim()) return;
    edit((d) => {
      const base = {
        id: id || crypto.randomUUID(),
        name: name.trim(),
        created: old?.created || new Date().toISOString(),
        modified: new Date().toISOString(),
      };
      if (kind === "layouts") {
        const value = { ...base, tree: structuredClone(d.session.tree) };
        d.layouts = d.layouts.filter((v) => v.id !== id);
        d.layouts.push(value);
      } else {
        const value = { ...base, snapshot: structuredClone(d.session) };
        d.workspaces = d.workspaces.filter((v) => v.id !== id);
        d.workspaces.push(value);
      }
    });
  };
  function favorite(id?: string) {
    const existing = c.favorites.find((f) => f.id === id),
      page = s.pages[selected];
    setFavoriteDraft(
      existing
        ? structuredClone(existing)
        : {
            id: crypto.randomUUID(),
            name: page?.title || "",
            url: page?.url || "",
            group: "常用",
            note: "",
            created: new Date().toISOString(),
          },
    );
  }
  const renameGroup = async (group: string) => {
    const name = await ask("分组名称", group);
    if (name)
      edit((d) => {
        d.groups = [...new Set(d.groups.map((g) => (g === group ? name : g)))];
        d.favorites.forEach((f) => {
          if (f.group === group) f.group = name;
        });
      });
  };
  const deleteGroup = (group: string) =>
    edit((d) => {
      d.groups = d.groups.filter((g) => g !== group);
      if (!d.groups.includes("未分组")) d.groups.push("未分组");
      d.favorites.forEach((f) => {
        if (f.group === group) f.group = "未分组";
      });
    });
  const favoriteListProps = {
    config: c,
    onEdit: edit,
    onOpen: (url: string) => open(url),
    onFavorite: favorite,
    onGroupRename: renameGroup,
    onGroupDelete: deleteGroup,
    onDrag: setDrag,
  };
  function renderPage(slot: number) {
    const p = s.pages[slot];
    return (
      <section
        data-slot={slot}
        className={
          "pane " +
          (!p && target === slot ? "drop" : "") +
          (selected === slot ? " selected" : "")
        }
        onPointerDown={() => setSelected(slot)}
        onDragOver={(e) => {
          e.preventDefault();
          setTarget(slot);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const from = e.dataTransfer.getData("slot"),
            url = e.dataTransfer.getData("favorite");
          if (from !== "" && s.pages[+from])
            void window.browser.exchange(c, +from, slot).catch(fail);
          if (url) open(url, slot);
          setDrag(false);
          setTarget(null);
        }}
      >
        <header className="pane-bar">
          <span
            className="handle"
            draggable={!!p}
            onDragStart={(e) => {
              e.dataTransfer.setData("slot", String(slot));
              e.dataTransfer.setData("application/x-mvb-slot", "1");
              e.dataTransfer.effectAllowed = "move";
              const targets = dragTargets();
              void window.browser.beginDrag(p!.id, targets).catch(fail);
              setDrag(true);
            }}
            onDragEnd={() => {
              void window.browser.endDrag();
              setDrag(false);
              setTarget(null);
            }}
            title={windowName(slot) + "：拖动交换网页"}
          >
            {windowShortName(slot)}
          </span>
          {p && (
            <>
              <button onClick={() => window.browser.navigate(p.id, "back")}>
                ‹
              </button>
              <button onClick={() => window.browser.navigate(p.id, "forward")}>
                ›
              </button>
              <button onClick={() => window.browser.navigate(p.id, "reload")}>
                ↻
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  open(
                    (
                      e.currentTarget.elements.namedItem(
                        "url",
                      ) as HTMLInputElement
                    ).value,
                    slot,
                  );
                }}
              >
                <input
                  name="url"
                  spellCheck={false}
                  key={p.url}
                  defaultValue={p.url}
                  title={p.title}
                />
              </form>
              <button
                className={
                  "audio-toggle " + (isMuted(p, slot) ? "muted" : "audible")
                }
                aria-label={"页面音量 " + p.volume + "%"}
                aria-pressed={isMuted(p, slot)}
                title="页面音量"
                onContextMenu={(e) => {
                  e.preventDefault();
                  pageEdit(slot, (p) => (p.audio = "auto"));
                }}
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  void window.browser
                    .showVolume(p.id, {
                      x: r.x,
                      y: r.y,
                      width: r.width,
                      height: r.height,
                    })
                    .catch(fail);
                }}
                onMouseLeave={() => void window.browser.hideVolume()}
                onClick={() =>
                  pageEdit(slot, (p) => {
                    if (isMuted(p, slot)) {
                      p.audio = "unmuted";
                      if (p.volume === 0) p.volume = 100;
                    } else p.audio = "muted";
                  })
                }
              >
                <AudioIcon
                  muted={(max !== null && slot !== 0) || isMuted(p, slot)}
                />
              </button>
              <button
                title="缩放设置"
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  void window.browser
                    .showScale(
                      p.id,
                      { x: r.x, y: r.y, width: r.width, height: r.height },
                      max === 0 && slot === 0,
                    )
                    .catch(fail);
                }}
                onMouseLeave={() => void window.browser.hideScale()}
              >
                ⚙
              </button>
              <button
                title="关闭网页"
                onClick={() =>
                  edit((d) => {
                    d.session.pages[slot] = null;
                  })
                }
              >
                ×
              </button>
            </>
          )}
        </header>
        <div
          className="web-area"
          title={
            slot === 0
              ? "双击留白放大主窗口 / 恢复分屏"
              : "双击留白与主窗口交换"
          }
          onDoubleClick={(e) => {
            if (e.target !== e.currentTarget) return;
            if (slot === 0) setMax(max === 0 ? null : 0);
            else
              void window.browser
                .exchange(c, p ? slot : 0, p ? 0 : slot)
                .catch(fail);
          }}
          ref={(el) => {
            if (el) areas.current.set(slot, el);
            else areas.current.delete(slot);
          }}
        >
          {!p && !drag && (
            <button
              className="add-page"
              onClick={() => open("https://live.bilibili.com", slot)}
            >
              ＋ 添加网页
            </button>
          )}
          {drag && !p && <span className="drop-hint">拖拽至此处交换</span>}
        </div>
      </section>
    );
  }
  return (
    <div className="app">
      <nav className="toolbar">
        <strong>
          <span className="logo">▦</span> MultiView Browser
          <small style={{ marginLeft: 6, opacity: 0.65 }}>
            V{version.version}
          </small>
        </strong>
        <button onClick={() => setPanel("layouts")}>▦ 布局</button>
        <button onClick={() => setSide(!side)}>☆ 收藏夹</button>
        <button
          aria-pressed={c.bookmarksBar}
          title="显示 / 隐藏横向收藏栏"
          onClick={() =>
            edit((d) => {
              d.bookmarksBar = !d.bookmarksBar;
            })
          }
        >
          收藏栏
        </button>
        <button onClick={add}>＋ 网页</button>
        <div className="spacer" />
        <label className="master-volume" title="浏览器主音量">
          <button
            className="master-mute"
            aria-label={c.masterMuted ? "恢复总音量" : "总音量静音"}
            aria-pressed={c.masterMuted}
            title={c.masterMuted ? "恢复原本音量" : "一键静音"}
            onClick={() =>
              edit((d) => {
                d.masterMuted = !d.masterMuted;
              })
            }
          >
            <AudioIcon muted={c.masterMuted || c.masterVolume === 0} />
          </button>
          <input
            aria-label="主音量"
            type="range"
            min="0"
            max="150"
            step="1"
            value={c.masterVolume}
            list="volume-marks"
            onKeyDown={(e) => {
              const direction = ["ArrowRight", "ArrowUp"].includes(e.key)
                ? 1
                : ["ArrowLeft", "ArrowDown"].includes(e.key)
                  ? -1
                  : 0;
              if (direction) {
                e.preventDefault();
                edit((d) => {
                  d.masterMuted = false;
                  d.masterVolume = stepVolume(
                    d.masterVolume,
                    direction as 1 | -1,
                  );
                });
              }
            }}
            onChange={(e) =>
              edit((d) => {
                d.masterMuted = false;
                d.masterVolume = snapVolume(+e.target.value);
              })
            }
          />
          <datalist id="volume-marks">
            {[25, 50, 75, 100].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <output>{c.masterVolume}%</output>
        </label>
        <button
          aria-pressed={max !== null}
          title="放大主窗口并保持主窗口音量并静音其他网页，再次点击恢复"
          onClick={() => setMax(max === null ? 0 : null)}
        >
          {max !== null ? "恢复分屏" : "放大主窗口"}
        </button>
        <button onClick={() => setPanel("workspaces")}>工作区</button>
        <button onClick={() => saveNamed("workspaces")}>保存工作区</button>
        <button onClick={() => setPanel("settings")}>设置</button>
      </nav>
      {c.bookmarksBar && (
        <nav className="bookmarks-bar" aria-label="收藏栏">
          <div className="bookmarks-links">
            <FavoritesList {...favoriteListProps} bar />
            {!c.favorites.length && (
              <span className="bookmark-empty">
                在收藏夹添加网站后，将按分组顺序显示在这里
              </span>
            )}
          </div>
          <button
            className="page-stash"
            title="页面暂存"
            aria-label={`页面暂存，${c.pageStash.length} 个页面`}
            onMouseLeave={() => void window.browser.hideStash()}
            onMouseEnter={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              void window.browser
                .showStash({ x: r.x, y: r.y, width: r.width, height: r.height })
                .catch(fail);
            }}
          >
            <svg
              className="stash-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
            </svg>
            <span>页面暂存</span>
            <span className="stash-count">{c.pageStash.length}</span>
            <svg
              className="stash-chevron"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </nav>
      )}
      <div className="body">
        {side && (
          <aside>
            <div className="side-title">
              收藏夹 <button onClick={() => favorite()}>＋</button>
            </div>
            <input
              placeholder="搜索名称、地址、备注"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label>
              打开位置{" "}
              <select
                value={selected}
                onChange={(e) => setSelected(+e.target.value)}
              >
                {slots(s.tree).map((i) => (
                  <option key={i} value={i}>
                    {windowName(i)}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={async () => {
                const name = await ask("新分组名称");
                if (name)
                  edit((d) => {
                    if (!d.groups.includes(name)) d.groups.push(name);
                  });
              }}
            >
              新建分组
            </button>
            <FavoritesList {...favoriteListProps} query={query} />
            <button onClick={() => favorite()}>☆ 收藏当前网页</button>
          </aside>
        )}
        <main>
          {max !== null ? (
            renderPage(max)
          ) : (
            <LayoutView
              tree={s.tree}
              onDrag={setDrag}
              onChange={(tree) =>
                edit((d) => {
                  d.session.tree = tree;
                })
              }
              render={renderPage}
            />
          )}
        </main>
      </div>
      <footer>
        <span>{s.pages.filter(Boolean).length} 个网页 · 共享登录会话</span>
        <span>
          {error ? (
            <button onClick={() => setError("")}>{error} ×</button>
          ) : max !== null ? (
            "放大模式：非主窗口静音 · 点击恢复分屏退出"
          ) : (
            "拖动标题栏或双击留白与主窗口换位 · 悬停扬声器调整音量 · 点击切换静音"
          )}
        </span>
      </footer>
      {panel && (
        <div className="modal-cover">
          <section className="modal">
            <div className="modal-title">
              <h2>
                {
                  (
                    {
                      layouts: "选择布局",
                      workspaces: "工作区",
                      settings: "设置与数据",
                    } as Record<string, string>
                  )[panel]
                }
              </h2>
              <button onClick={() => setPanel("")}>×</button>
            </div>
            {panel === "layouts" && (
              <>
                <div className="preset-grid">
                  {presets.map((p, i) => (
                    <button
                      className={s.layoutId === p.id ? "active" : ""}
                      key={p.id}
                      onClick={() => apply(p.tree, p.id)}
                    >
                      <Thumbnail tree={p.tree} />
                      <span>
                        {i + 1}. {p.name}
                      </span>
                    </button>
                  ))}
                </div>
                <h3>我的布局</h3>
                <button onClick={() => saveNamed("layouts")}>
                  保存为新布局
                </button>
                <button onClick={reset}>恢复保存 / 默认比例</button>
                {c.layouts.map((p) => (
                  <div className="saved" key={p.id}>
                    <button onClick={() => apply(p.tree, p.id)}>
                      {p.name}
                    </button>
                    <button onClick={() => saveNamed("layouts", p.id)}>
                      覆盖
                    </button>
                    <button
                      onClick={async () => {
                        const name = await ask("新名称", p.name);
                        if (name)
                          edit((d) => {
                            d.layouts.find((v) => v.id === p.id)!.name = name;
                          });
                      }}
                    >
                      重命名
                    </button>
                    <button
                      onClick={() =>
                        edit((d) => {
                          d.layouts = d.layouts.filter((v) => v.id !== p.id);
                        })
                      }
                    >
                      删除
                    </button>
                  </div>
                ))}
              </>
            )}
            {panel === "workspaces" && (
              <>
                <p>
                  保存网页组合、布局比例、音频和缩放设置。加载时重新打开网页。
                </p>
                <button onClick={() => saveNamed("workspaces")}>
                  另存为工作区
                </button>
                {c.workspaces.map((w) => (
                  <div className="saved" key={w.id}>
                    <button
                      onClick={() => {
                        edit((d) => {
                          d.session = structuredClone(w.snapshot);
                        });
                        setMax(null);
                        setPanel("");
                      }}
                    >
                      {w.name}
                    </button>
                    <button onClick={() => saveNamed("workspaces", w.id)}>
                      覆盖
                    </button>
                    <button
                      onClick={async () => {
                        const name = await ask("新名称", w.name);
                        if (name)
                          edit((d) => {
                            d.workspaces.find((v) => v.id === w.id)!.name =
                              name;
                          });
                      }}
                    >
                      重命名
                    </button>
                    <button
                      onClick={() =>
                        edit((d) => {
                          d.workspaces = d.workspaces.filter(
                            (v) => v.id !== w.id,
                          );
                        })
                      }
                    >
                      删除
                    </button>
                  </div>
                ))}
              </>
            )}
            {panel === "settings" && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={c.bookmarksBar}
                    onChange={(e) =>
                      edit((d) => {
                        d.bookmarksBar = e.target.checked;
                      })
                    }
                  />{" "}
                  显示横向收藏栏
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={c.restore}
                    onChange={(e) =>
                      edit((d) => {
                        d.restore = e.target.checked;
                      })
                    }
                  />{" "}
                  启动时恢复上次会话
                </label>
                <p>
                  导入导出包含收藏、分组、自定义布局、命名工作区和上次会话。导入会替换现有配置。
                </p>
                <button
                  onClick={() =>
                    window.browser
                      .save(c)
                      .then(() => window.browser.transfer("export"))
                      .catch(fail)
                  }
                >
                  导出 JSON
                </button>
                <button
                  onClick={() => {
                    if (confirm("导入将替换当前配置，继续？"))
                      window.browser
                        .transfer("import")
                        .then((value) => {
                          if (value) {
                            setConfig(value);
                            setMax(null);
                          }
                        })
                        .catch(fail);
                  }}
                >
                  导入 JSON
                </button>
                <p>
                  远程网页使用沙箱与共享持久化
                  Session。摄像头、麦克风、通知等权限默认拒绝；弹窗在原槽位打开。
                </p>
              </>
            )}
          </section>
        </div>
      )}
      {favoriteDraft && (
        <div className="modal-cover">
          <FavoriteEditor
            key={favoriteDraft.id}
            initial={favoriteDraft}
            editing={c.favorites.some((f) => f.id === favoriteDraft.id)}
            groups={c.groups}
            onCancel={() => setFavoriteDraft(undefined)}
            onSave={(value) => {
              edit((d) => {
                const index = d.favorites.findIndex((f) => f.id === value.id);
                if (index >= 0) d.favorites[index] = value;
                else d.favorites.push(value);
                if (!d.groups.includes(value.group)) d.groups.push(value.group);
              });
              setFavoriteDraft(undefined);
            }}
          />
        </div>
      )}
      {question && (
        <div className="modal-cover question">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              question.resolve(question.value);
              setQuestion(undefined);
            }}
          >
            <h3>{question.text}</h3>
            <input
              autoFocus
              style={{ width: "100%" }}
              value={question.value}
              onChange={(e) =>
                setQuestion({ ...question, value: e.target.value })
              }
            />
            <div className="saved">
              <button type="submit">确定</button>
              <button
                type="button"
                onClick={() => {
                  question.resolve(null);
                  setQuestion(undefined);
                }}
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
