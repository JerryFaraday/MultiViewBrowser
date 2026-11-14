/** Keep Bilibili's long, scrollable episode lists out of offscreen layout work.
 * These compact row sizes are intrinsic placeholders, not forced row heights.
 * Visible rows retain the site's own layout, events and contents.
 */
export function installBilibiliLayoutCompatibility() {
  if (
    location.hostname !== "www.bilibili.com" ||
    !location.pathname.startsWith("/video/") ||
    window !== window.top
  )
    return;
  const style = document.createElement("style");
  style.id = "mvb-bilibili-collection-layout";
  style.textContent = `
    .video-pod__item.simple.pod-item {
      content-visibility: auto;
      contain-intrinsic-block-size: auto 31px;
    }
    .bpx-player-ctrl-eplist-multi-menu-item {
      content-visibility: auto;
      contain-intrinsic-block-size: auto 30px;
    }
  `;
  document.head.append(style);
}
