import { afterEach, expect, it, vi } from "vitest";
import { installBilibiliLayoutCompatibility } from "../electron/bilibili-layout";

afterEach(() => vi.unstubAllGlobals());

it.each([
  ["www.bilibili.com", "/video/BVtest", true, true],
  ["www.bilibili.com", "/", true, false],
  ["live.bilibili.com", "/video/BVtest", true, false],
  ["example.com", "/video/BVtest", true, false],
  ["www.bilibili.com", "/video/BVtest", false, false],
])(
  "合集兼容规则限定站点、视频路径及顶层页面 %s %s %s",
  (hostname, pathname, top, allowed) => {
    const append = vi.fn();
    const frame = { top: null as unknown };
    frame.top = top ? frame : {};
    vi.stubGlobal("window", frame);
    vi.stubGlobal("location", { hostname, pathname });
    vi.stubGlobal("document", { createElement: () => ({}), head: { append } });
    installBilibiliLayoutCompatibility();
    expect(append).toHaveBeenCalledTimes(allowed ? 1 : 0);
  },
);
