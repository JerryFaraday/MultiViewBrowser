import { it, expect } from "vitest";
import { isLiveProfileLink } from "../src/core/NavigationPolicy";
it("直播间个人主页请求单独允许进入空槽，普通链接和伪造域名不扩大权限", () => {
  const source = "https://live.bilibili.com/21516508";
  expect(isLiveProfileLink(source, "https://space.bilibili.com/12345")).toBe(
    true,
  );
  expect(
    isLiveProfileLink(source, "https://space.bilibili.com/12345/dynamic"),
  ).toBe(true);
  for (const target of [
    source,
    "https://space.bilibili.com.evil.test/123",
    "https://space.bilibili.com/",
    "javascript:alert(1)",
  ])
    expect(isLiveProfileLink(source, target)).toBe(false);
  expect(
    isLiveProfileLink("https://example.com", "https://space.bilibili.com/123"),
  ).toBe(false);
});
