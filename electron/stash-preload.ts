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
        const row = document.createElement("div");
        row.className = "stash-row";
        row.dataset.id = item.id;
        const button = document.createElement("button");
        button.textContent = item.title;
        button.title = item.title;
        button.onclick = () => void ipcRenderer.invoke("stash-open", item.id);
        button.draggable = true;
        button.ondragstart = (e) => {
          e.dataTransfer!.setData("application/x-mvb-slot", "1");
          e.dataTransfer!.effectAllowed = "move";
          const rows = Array.from(
            list.querySelectorAll<HTMLElement>(".stash-row"),
          ).flatMap((el) => {
            const r = el.getBoundingClientRect(),
              top = Math.max(0, r.top),
              bottom = Math.min(innerHeight, r.bottom);
            return bottom > top
              ? [
                  {
                    id: el.dataset.id,
                    rect: {
                      x: r.x,
                      y: top,
                      width: r.width,
                      height: bottom - top,
                    },
                  },
                ]
              : [];
          });
          void ipcRenderer.invoke("stash-drag", item.id, rows);
        };
        button.ondragend = () => void ipcRenderer.invoke("stash-drag-end");
        button.onkeydown = (e) => {
          if (e.key === "Enter") void ipcRenderer.invoke("stash-open", item.id);
        };
        const close = () => {
          const b = document.createElement("button");
          b.className = "stash-close";
          b.textContent = "×";
          b.title = "关闭暂存网页";
          b.setAttribute("aria-label", "关闭 " + item.title);
          b.onclick = (e) => {
            e.stopPropagation();
            void ipcRenderer.invoke("stash-close", item.id);
          };
          return b;
        };
        row.append(button, close());
        list.append(row);
      }
    },
  );
});
