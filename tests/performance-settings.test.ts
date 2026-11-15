import { it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../electron/storage";
import { defaults } from "../src/core/WorkspaceManager";
import { defaultPreferences } from "../src/core/Preferences";
import { OperationLogger } from "../electron/OperationLogger";
it("旧配置补全性能偏好，不重置收藏与会话", () => {
  const folder = mkdtempSync(join(tmpdir(), "mvb-legacy-")),
    c = defaults();
  const raw = { ...c, preferences: { theme: "gray", liveInterval: 90 } };
  writeFileSync(join(folder, "config.json"), JSON.stringify(raw));
  const loaded = new ConfigStore(folder).load();
  expect(loaded.session).toEqual(c.session);
  expect(loaded.groups).toEqual(c.groups);
  expect(loaded.preferences).toMatchObject({
    theme: "gray",
    backgroundThrottling: true,
    autoReleaseStash: false,
    stashReleaseMinutes: 60,
    muteOnMaximize: true,
    pauseOnMaximize: false,
    pauseInSettings: false,
    autoFetchStashTitle: false,
    liveResize: true,
    logMode: "detailed",
    liveInterval: 90,
  });
});
it("内存立即可见、合并落盘、无变化不递增、退出 flush 与备份有效", async () => {
  const folder = mkdtempSync(join(tmpdir(), "mvb-buffer-")),
    store = new ConfigStore(folder, 10000),
    c = defaults();
  store.save(c);
  await store.flush();
  const initial = readFileSync(store.file, "utf8");
  for (let i = 0; i < 40; i++) {
    const next = store.load();
    next.masterVolume = 100 + i;
    store.save(next);
    expect(store.load().masterVolume).toBe(100 + i);
  }
  expect(readFileSync(store.file, "utf8")).toBe(initial);
  const last = store.load();
  store.save(last);
  expect(store.load().revision).toBe(last.revision);
  await store.flush();
  expect(new ConfigStore(folder).load().masterVolume).toBe(139);
  expect(
    JSON.parse(readFileSync(store.file + ".bak", "utf8")).masterVolume,
  ).toBe(100);
});
it("性能偏好边界校验", () => {
  expect(defaultPreferences().stashReleaseMinutes).toBe(60);
  const folder = mkdtempSync(join(tmpdir(), "mvb-invalid-")),
    c = defaults();
  (c.preferences as any).stashReleaseMinutes = 31;
  expect(() => new ConfigStore(folder).save(c)).toThrow();
});
it("日志合并保持次序、正常退出写尾、普通模式过滤高频事件", async () => {
  const folder = mkdtempSync(join(tmpdir(), "mvb-log-buffer-")),
    logger = new OperationLogger(folder, "0.2.5.3");
  for (let i = 0; i < 100; i++) logger.write("web.scroll", { slot: 1 });
  logger.write("web.click", { slot: 2 });
  logger.mode = "normal";
  logger.write("web.scroll", { slot: 3 });
  await logger.end();
  const rows = readFileSync(logger.file, "utf8")
    .trim()
    .split("\n")
    .map((x) => JSON.parse(x));
  expect(rows.map((x) => x.event)).toEqual([
    "session.start",
    "web.scroll",
    "web.click",
    "session.end",
  ]);
  expect(rows[1].repeat).toBe(100);
  expect(rows[1].endSeq).toBeLessThan(rows[2].seq);
  expect(rows[2].slot).toBe(2);
});
