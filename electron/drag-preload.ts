import { ipcRenderer } from "electron";
import type { DropTarget } from "./DragOverlay";
window.addEventListener("DOMContentLoaded", () => {
  let targets: DropTarget[] = [];
  const highlight = document.getElementById("highlight")!;
  const update = (value: DropTarget[]) => {
    targets = value;
    highlight.hidden = true;
  };
  ipcRenderer.on("drag-targets", (_event, value) => update(value));
  void ipcRenderer.invoke("overlay-targets").then(update);
  const hit = (event: DragEvent) =>
    targets.find(
      (t) =>
        event.clientX >= t.rect.x &&
        event.clientX < t.rect.x + t.rect.width &&
        event.clientY >= t.rect.y &&
        event.clientY < t.rect.y + t.rect.height,
    );
  for (const type of ["dragenter", "dragover", "drop"] as const)
    window.addEventListener(
      type,
      (raw: Event) => {
        const event = raw as DragEvent;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (
          !event.isTrusted ||
          !event.dataTransfer?.types.includes("application/x-mvb-slot")
        )
          return;
        const target = hit(event);
        event.dataTransfer.dropEffect = target ? "move" : "none";
        highlight.hidden = !target;
        if (target)
          Object.assign(highlight.style, {
            left: target.rect.x + "px",
            top: target.rect.y + "px",
            width: target.rect.width + "px",
            height: target.rect.height + "px",
          });
        if (type === "drop" && target)
          void ipcRenderer.invoke("overlay-drop", target.slot);
      },
      true,
    );
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") void ipcRenderer.invoke("overlay-cancel");
  });
  for (const type of ["click", "mousedown", "mouseup", "wheel", "contextmenu"])
    window.addEventListener(
      type,
      (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      true,
    );
});
