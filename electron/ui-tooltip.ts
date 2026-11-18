/** Self-contained, serialized only into application-owned BrowserWindow documents. */
export function installUITooltips(enabled: boolean) {
  const host = window as Window & {
    __mvbTooltip?: { setEnabled(value: boolean): void };
  };
  if (host.__mvbTooltip) {
    host.__mvbTooltip.setEnabled(enabled);
    return;
  }
  const tip = document.createElement("div");
  tip.id = "mvb-ui-tooltip";
  tip.role = "tooltip";
  tip.hidden = true;
  tip.style.cssText =
    'position:fixed;z-index:2147483647;pointer-events:none;max-width:min(360px,calc(100vw - 16px));padding:5px 8px;border:1px solid var(--border-strong,#555);border-radius:6px;background:var(--bg-elevated,#303034);color:var(--text-primary,#eee);font:12px/18px "Segoe UI","Microsoft YaHei UI",sans-serif;white-space:normal;overflow-wrap:anywhere;box-sizing:border-box;';
  document.documentElement.append(tip);
  let active: Element | null = null,
    timer: ReturnType<typeof setTimeout> | undefined,
    allowed = enabled;
  const hide = () => {
    clearTimeout(timer);
    timer = undefined;
    tip.hidden = true;
    active = null;
  };
  const convert = () => {
    for (const el of document.querySelectorAll("[title]")) {
      const title = el.getAttribute("title") ?? "";
      el.setAttribute("data-hidden-title", title);
      if (
        el.matches("button,a,[role=button]") &&
        !el.hasAttribute("aria-labelledby") &&
        (!el.hasAttribute("aria-label") ||
          el.hasAttribute("data-mvb-tooltip-label"))
      ) {
        el.setAttribute("aria-label", title);
        el.setAttribute("data-mvb-tooltip-label", "true");
      }
      el.removeAttribute("title");
    }
  };
  convert();
  new MutationObserver(convert).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["title"],
  });
  const hover = (event: Event) => {
    if (!allowed || !document.hasFocus()) {
      hide();
      return;
    }
    const target =
      (event.target as Element | null)?.closest?.("[data-hidden-title]") ??
      null;
    if (target === active) return;
    hide();
    if (!target) return;
    active = target;
    timer = setTimeout(() => {
      if (
        !document.hasFocus() ||
        !allowed ||
        !target.isConnected ||
        active !== target
      )
        return;
      const text = target.getAttribute("data-hidden-title");
      if (!text) return;
      tip.textContent = text;
      tip.hidden = false;
      const r = target.getBoundingClientRect(),
        t = tip.getBoundingClientRect();
      tip.style.left =
        Math.max(8, Math.min(r.left, innerWidth - t.width - 8)) + "px";
      tip.style.top =
        Math.max(
          8,
          Math.min(r.top - t.height - 6, innerHeight - t.height - 8),
        ) + "px";
    }, 400);
  };
  document.addEventListener("pointerover", hover, true);
  document.addEventListener("pointermove", hover, true);
  for (const event of ["pointerdown", "keydown", "scroll", "dragstart"])
    document.addEventListener(event, hide, true);
  document.documentElement.addEventListener("pointerleave", hide);
  window.addEventListener("blur", hide);
  document.addEventListener("visibilitychange", hide);
  host.__mvbTooltip = {
    setEnabled(value) {
      allowed = value;
      hide();
      convert();
    },
  };
}
