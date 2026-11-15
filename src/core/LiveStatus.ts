import { z } from "zod";
export function roomId(input: string) {
  if (!/^\d{1,20}$/.test(input) || /^0+$/.test(input))
    throw Error("请输入有效的纯数字直播间号");
  return BigInt(input).toString();
}
export type LiveCategory = "bilibili-live" | "douyu-live";
export function identifyLiveUrl(input: string): {
  category: LiveCategory;
  roomId: string;
} {
  if ([...input].some((c) => [92, 13, 10].includes(c.charCodeAt(0))))
    throw Error("直播间地址格式错误");
  const u = new URL(input);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    !["live.bilibili.com", "www.douyu.com", "douyu.com"].includes(u.hostname) ||
    u.username ||
    u.password ||
    u.port ||
    !/^\/\d+\/?$/.test(u.pathname)
  )
    throw Error("仅接受B站或斗鱼直播间数字房号地址");
  return {
    category:
      u.hostname === "live.bilibili.com" ? "bilibili-live" : "douyu-live",
    roomId: roomId(u.pathname.split("/")[1]),
  };
}
export function roomFromUrl(
  input: string,
  category: LiveCategory = "bilibili-live",
) {
  const result = identifyLiveUrl(input);
  if (result.category !== category) throw Error("直播平台不匹配");
  return result.roomId;
}
export function liveUrl(id: string, category: LiveCategory = "bilibili-live") {
  return (
    (category === "douyu-live"
      ? "https://www.douyu.com/"
      : "https://live.bilibili.com/") + roomId(id)
  );
}
export function favoriteLiveUrl(
  id: string,
  previous: string,
  category: LiveCategory = "bilibili-live",
) {
  const valid = roomId(id);
  try {
    if (roomFromUrl(previous, category) === valid) return previous;
  } catch {}
  return liveUrl(valid, category);
}
// Keep existing Bilibili keys compatible; platform-qualify Douyu to avoid collisions.
export function liveKey(f: { category: string; roomId: string }) {
  return f.category === "douyu-live" ? "douyu:" + f.roomId : f.roomId;
}
export type LiveState = {
  status: "live" | "offline" | "unknown";
  reason?: "pending" | "network" | "api" | "replay" | "unavailable";
};
export type LiveStates = Record<string, LiveState>;
export function apiState(value: unknown): LiveState {
  return value === 1
    ? { status: "live" }
    : value === 0
      ? { status: "offline" }
      : { status: "unknown", reason: value === 2 ? "replay" : "api" };
}
export function liveLabel(state?: LiveState) {
  if (state?.status === "live") return "正在直播";
  if (state?.status === "offline") return "未开播";
  if (state?.reason === "unavailable") return "检测程序不可用，请检查安装文件";
  if (state?.reason === "network") return "网络错误或超时，等待下次重试";
  if (state?.reason === "api") return "接口返回异常，等待下次重试";
  return state?.reason === "replay"
    ? "轮播中（非实时开播）"
    : state?.reason === "pending" || !state
      ? "尚未获得直播状态"
      : "检测失败，等待下次重试";
}

const cachedId = z.string().refine((s) => {
  try {
    return roomId(s) === s;
  } catch {
    return false;
  }
});
export const liveCacheSchema = z.object({
  formatVersion: z.literal(1),
  inputRoomId: cachedId,
  realRoomId: cachedId,
  uid: cachedId,
  checkedAt: z.number().int().nonnegative().max(8640000000000000),
});
export type LiveCache = z.infer<typeof liveCacheSchema>;
export type CacheUpdate = {
  favoriteId: string;
  roomId: string;
  cache: LiveCache;
};
export const mappingCheckInterval = 24 * 60 * 60 * 1000;
export function mappingDue(cache: LiveCache, now = Date.now()) {
  return cache.checkedAt > now || now - cache.checkedAt >= mappingCheckInterval;
}
