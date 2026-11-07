/** Only Bilibili live-room profile navigation gets the left-click new-slot exception. */
export function isLiveProfileLink(source: string, target: string) {
  try {
    const from = new URL(source),
      to = new URL(target);
    return (
      from.hostname === "live.bilibili.com" &&
      ["http:", "https:"].includes(to.protocol) &&
      to.hostname === "space.bilibili.com" &&
      /^\/\d+(?:\/|$)/.test(to.pathname)
    );
  } catch {
    return false;
  }
}
