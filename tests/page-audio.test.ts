import { it, expect } from "vitest";
import { configSchema, newPage, pageSchema } from "../src/core/model";
import { defaults } from "../src/core/WorkspaceManager";
import { effectiveVolume, isMuted, swapPages } from "../src/core/AudioManager";
it("主窗口静音再解除后移出仍静音，保留音量且不影响无关窗口", () => {
  for (const [from, to] of [
    [0, 1],
    [1, 0],
    [0, 3],
  ]) {
    const a = newPage("https://a.com"),
      b = newPage("https://b.com"),
      c = newPage("https://c.com");
    a.audio = "muted";
    a.audio = "unmuted";
    a.volume = 75;
    c.audio = "unmuted";
    const result = swapPages([a, b, c], from, to);
    const destination = from === 0 ? to : from;
    expect(result[destination].id).toBe(a.id);
    expect(result[destination].volume).toBe(75);
    expect(isMuted(result[destination], destination)).toBe(true);
    expect(result[2]).toBe(c);
    if (result[0]) expect(isMuted(result[0], 0)).toBe(false);
    expect(a.audio).toBe("unmuted");
  }
});
it("旧配置默认 100% 且总静音独立保存音量", () => {
  const c = defaults();
  expect(c.masterVolume).toBe(100);
  const { masterMuted, ...old } = c;
  expect(configSchema.parse(old).masterMuted).toBe(false);
  c.masterVolume = 75;
  c.masterMuted = true;
  expect(configSchema.parse(c).masterVolume).toBe(75);
});
it("页面仅接收五个音量档位，与总音量分别保存", () => {
  const p = newPage("https://example.com");
  for (const volume of [0, 25, 50, 75, 100])
    expect(pageSchema.parse({ ...p, volume }).volume).toBe(volume);
  expect(() => pageSchema.parse({ ...p, volume: 30 })).toThrow();
  expect(effectiveVolume(80, 25)).toBe(20);
  p.volume = 0;
  expect(isMuted(p, 0)).toBe(true);
});
it("双击和拖动共用换位规则，主窗口清除 0 音量", () => {
  const a = newPage("https://a.com"),
    b = newPage("https://b.com");
  b.volume = 0;
  b.audio = "muted";
  const result = swapPages([a, b], 1, 0);
  expect(result[0].id).toBe(b.id);
  expect(result[0].volume).toBe(100);
  expect(isMuted(result[0], 0)).toBe(false);
  expect(b.volume).toBe(0);
});
