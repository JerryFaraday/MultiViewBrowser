import type { LogDetails, OperationEvent } from "./core/OperationLog";
import "./api";
/** Labels only select fixed action identifiers; no labels or user text are persisted. */
export function installOperationLog() {
  const labels: Record<string, string> = {
    "▦ 布局": "layout.open",
    "☆ 收藏夹": "favorites.toggle",
    收藏栏: "bookmarks.toggle",
    "＋ 网页": "page.add",
    工作区: "workspace.open",
    保存工作区: "workspace.save",
    设置: "settings.open",
    放大主窗口: "page.maximize",
    恢复分屏: "page.maximize",
    "☆ 收藏当前网页": "favorites.add",
    新建分组: "group.add",
    保存为新布局: "layout.save",
    "恢复保存 / 默认比例": "layout.reset",
    另存为工作区: "workspace.save",
    "导出 JSON": "data.export",
    "导入 JSON": "data.import",
    保存收藏: "dialog.save",
    取消: "dialog.cancel",
    确定: "dialog.save",
    重命名: "item.rename",
    删除: "item.delete",
    覆盖: "item.overwrite",
    "‹": "page.back",
    "›": "page.forward",
    "↻": "page.reload",
  };
  let lastInput = 0;
  const handler = (event: Event) => {
    if (!event.isTrusted) return;
    const target = event.target instanceof Element ? event.target : undefined;
    if (!target) return;
    const details: LogDetails = {
      area: target.closest(".toolbar")
        ? "toolbar"
        : target.closest("aside")
          ? "favorites"
          : target.closest(".bookmarks-bar")
            ? "bookmarks"
            : target.closest(".modal")
              ? "dialog"
              : target.closest(".pane")
                ? "pane"
                : "other",
      control: "other",
    };
    const pane = target.closest<HTMLElement>(".pane");
    if (pane) details.slot = Number(pane.dataset.slot);
    if (pane) details.action = "page.select";
    const button = target.closest("button");
    if (button) {
      const action = labels[button.textContent?.trim() ?? ""];
      if (action) details.action = action;
      if (
        button.closest(".saved") &&
        button === button.parentElement?.querySelector("button")
      )
        details.action = "item.apply";
      if (button.closest(".preset-grid")) details.action = "layout.apply";
      if (button.closest(".favorite,.bookmark")) {
        const row = button.parentElement!,
          index = [...row.querySelectorAll("button")].indexOf(button);
        details.action =
          index === 0
            ? "favorites.open"
            : index === 1
              ? "favorites.edit"
              : "favorites.delete";
      }
      if (
        button.classList.contains("audio-toggle") ||
        button.classList.contains("master-mute")
      )
        details.action = "audio.toggle";
      if (button.title === "关闭网页") details.action = "page.close";
      if (button.title === "缩放设置") details.action = "page.scale";
      if (button.title === "最大化 / 还原") details.action = "page.maximize";
      if (button.closest(".modal-title")) details.action = "dialog.close";
    }
    if (target.closest(".handle")) details.control = "handle";
    else if (target.closest(".divider")) details.control = "divider";
    else if (target.closest(".audio-toggle,.master-mute"))
      details.control = "audio";
    else if (target.closest("button")) details.control = "button";
    if (target instanceof HTMLInputElement) {
      details.control =
        target.type === "range"
          ? "range"
          : target.type === "checkbox"
            ? "checkbox"
            : "text";
      if (target.type === "range") details.value = Math.round(+target.value);
      if (target.type === "range")
        details.action = target.closest(".master-volume")
          ? "audio.master"
          : "audio.page";
      else if (target.type === "checkbox") details.action = "settings.change";
      else details.action = "text.edit";
      if (target.type === "checkbox") details.changed = target.checked;
    } else if (target instanceof HTMLTextAreaElement) details.control = "text";
    else if (target instanceof HTMLSelectElement) details.control = "select";
    const names: Record<string, OperationEvent> = {
      click: "ui.click",
      dblclick: "ui.double_click",
      pointerdown: "ui.pointer_down",
      input: "ui.input",
      change: "ui.change",
      submit: "ui.submit",
      keydown: "ui.key",
      dragstart: "ui.drag_start",
      dragend: "ui.drag_end",
      drop: "ui.drop",
    };
    if (event.type === "input") {
      if (Date.now() - lastInput < 200) return;
      lastInput = Date.now();
    }
    if (event instanceof KeyboardEvent)
      details.status =
        event.ctrlKey ||
        event.metaKey ||
        event.key === "Escape" ||
        event.key === "F11"
          ? "shortcut"
          : "input";
    void window.browser.log(names[event.type], details).catch(() => {});
  };
  const events = [
    "click",
    "dblclick",
    "pointerdown",
    "input",
    "change",
    "submit",
    "keydown",
    "dragstart",
    "dragend",
    "drop",
  ];
  events.forEach((type) => document.addEventListener(type, handler, true));
  return () =>
    events.forEach((type) => document.removeEventListener(type, handler, true));
}
