import { ipcRenderer } from "electron";
import type { Page } from "../src/core/model";
window.addEventListener("DOMContentLoaded", () => {
  const mode = document.querySelector<HTMLSelectElement>("#mode")!,
    resolution = document.querySelector<HTMLSelectElement>("#resolution")!,
    factor = document.querySelector<HTMLInputElement>("#factor")!;
  const update = (state?: {
    scale: Page["scale"];
    locked: boolean;
    slot: number;
  }) => {
    if (!state) return;
    const value = `${state.scale.width}x${state.scale.height}`;
    resolution.querySelector("[data-legacy]")?.remove();
    if (![...resolution.options].some((o) => o.value === value)) {
      const option = new Option(
        `原有设置（${state.scale.width} × ${state.scale.height}）`,
        value,
      );
      option.dataset.legacy = "true";
      option.disabled = true;
      resolution.add(option);
    }
    mode.value = state.scale.mode;
    resolution.value = value;
    factor.value = String(state.scale.factor);
    mode.disabled = resolution.disabled = state.locked;
    factor.disabled = state.locked || state.scale.mode !== "manual";
    document.querySelector("#heading")!.textContent =
      (state.slot === 0 ? "主窗口" : `${state.slot + 1}号窗口`) + " · 网页缩放";
    document.querySelector("#hint")!.textContent = state.locked
      ? "主窗口放大期间使用2K，恢复分屏后还原原设置。"
      : "修改后立即生效，移出此弹窗和按钮后关闭。";
  };
  void ipcRenderer.invoke("scale-popup-state").then(update);
  ipcRenderer.on("popup-scale", (_e, state) => update(state));
  for (const [element, kind] of [
    [mode, "mode"],
    [resolution, "resolution"],
    [factor, "factor"],
  ] as const) {
    element.addEventListener("change", () => {
      selecting = false;
      const value = kind === "factor" ? Number(element.value) : element.value;
      if (
        kind === "factor" &&
        (!Number.isFinite(value) || Number(value) < 0.05 || Number(value) > 3)
      )
        return;
      void ipcRenderer.invoke("scale-popup-change", { kind, value });
      if (!document.documentElement.matches(":hover")) leave();
    });
  }
  // Native select menus can extend beyond this window; keep the parent alive until selection ends.
  let selecting = false;
  const leave = () => {
    if (!selecting) void ipcRenderer.invoke("scale-popup-hover", false);
  };
  document.addEventListener(
    "mouseover",
    () => void ipcRenderer.invoke("scale-popup-hover", true),
  );
  document.addEventListener("mouseleave", leave);
  for (const select of [mode, resolution]) {
    select.addEventListener("click", () => {
      selecting = false;
      if (!document.documentElement.matches(":hover")) leave();
    });
    select.addEventListener("pointerdown", () => {
      selecting = true;
    });
    select.addEventListener("blur", () => {
      selecting = false;
      if (!document.documentElement.matches(":hover")) leave();
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      selecting = false;
      leave();
    }
  });
});
