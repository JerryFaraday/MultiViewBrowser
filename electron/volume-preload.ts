import { ipcRenderer } from "electron";
window.addEventListener("DOMContentLoaded", () => {
  const input = document.querySelector("input")!,
    output = document.querySelector("output")!;
  const update = (value: number) => {
    input.value = String(value);
    output.value = String(value);
  };
  void ipcRenderer.invoke("volume-popup-state").then(update);
  ipcRenderer.on("popup-volume", (_e, value: number) => update(value));
  input.addEventListener("input", () => {
    output.value = input.value;
    void ipcRenderer.invoke("volume-popup-value", +input.value);
  });
  let dragging = false;
  document.addEventListener(
    "mouseover",
    () => void ipcRenderer.invoke("volume-popup-hover", true),
  );
  document.addEventListener("pointerdown", () => {
    dragging = true;
  });
  document.addEventListener("pointerup", () => {
    dragging = false;
    if (!document.documentElement.matches(":hover"))
      void ipcRenderer.invoke("volume-popup-hover", false);
  });
  document.addEventListener("mouseleave", () => {
    if (!dragging) void ipcRenderer.invoke("volume-popup-hover", false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape")
      void ipcRenderer.invoke("volume-popup-hover", false);
  });
});
