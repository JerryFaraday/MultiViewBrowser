export function roomId(input: string) {
  if (!/^\d{1,20}$/.test(input) || /^0+$/.test(input))
    throw Error("请输入有效的纯数字直播间号");
  return BigInt(input).toString();
}
export function roomFromUrl(input: string) {
  if ([...input].some((c) => [92, 13, 10].includes(c.charCodeAt(0))))
    throw Error("直播间地址格式错误");
  const u = new URL(input);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.hostname !== "live.bilibili.com" ||
    u.username ||
    u.password ||
    u.port ||
    !/^\/\d+\/?$/.test(u.pathname)
  )
    throw Error("仅接受B站直播间数字房号地址");
  return roomId(u.pathname.split("/")[1]);
}
export function liveUrl(id: string) {
  return "https://live.bilibili.com/" + roomId(id);
}
export function favoriteLiveUrl(id: string, previous: string) {
  const valid = roomId(id);
  try {
    if (roomFromUrl(previous) === valid) return previous;
  } catch {}
  return liveUrl(valid);
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
