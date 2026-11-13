import { ipcRenderer } from "electron";
window.addEventListener("DOMContentLoaded", () => {
  document.addEventListener(
    "mouseenter",
    () => void ipcRenderer.invoke("stash-hover", true),
  );
  document.addEventListener(
    "mouseleave",
    () => void ipcRenderer.invoke("stash-hover", false),
  );
  ipcRenderer.on(
    "stash-items",
    (_e, items: { id: string; title: string }[]) => {
      const list = document.getElementById("list")!;
      list.replaceChildren();
      if (!items.length) list.textContent = "暂无暂存页面";
      for (const item of items) {
        const button = document.createElement("button");
        button.textContent = item.title;
        button.title = item.title;
        button.onclick = () => void ipcRenderer.invoke("stash-open", item.id);
        button.draggable = true;
        button.ondragstart = (e) => {
          e.dataTransfer!.setData("application/x-mvb-slot", "1");
          e.dataTransfer!.effectAllowed = "move";
          void ipcRenderer.invoke("stash-drag", item.id);
        };
        button.ondragend = () => void ipcRenderer.invoke("stash-drag-end");
        button.onkeydown = (e) => {
          if (e.key === "Enter") void ipcRenderer.invoke("stash-open", item.id);
        };
        list.append(button);
      }
    },
  );
});
