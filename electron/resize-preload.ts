import { ipcRenderer } from "electron";
let pending: MouseEvent | undefined,
  frame = 0;
const emit = (event: MouseEvent, done: boolean) =>
  ipcRenderer.send("resize-pointer", {
    x: event.clientX,
    y: event.clientY,
    done,
  });
window.addEventListener("mousemove", (event) => {
  pending = event;
  if (!frame)
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (pending) emit(pending, false);
    });
});
window.addEventListener("mouseup", (event) => {
  cancelAnimationFrame(frame);
  frame = 0;
  pending = undefined;
  emit(event, true);
});
window.addEventListener("contextmenu", (event) => event.preventDefault());
ipcRenderer.on("resize-cursor", (_event, cursor) => {
  document.documentElement.style.cursor = cursor;
});
ipcRenderer.on("resize-line", (_event, rect) => {
  const line = document.querySelector("div") as HTMLElement | null;
  if (!line) return;
  if (!rect) {
    line.style.display = "none";
    return;
  }
  line.style.cssText = `display:block;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;background:${rect.color}`;
});
