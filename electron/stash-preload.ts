import { ipcRenderer } from "electron";
window.addEventListener("DOMContentLoaded", () => {
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
        button.ondblclick = () =>
          void ipcRenderer.invoke("stash-open", item.id);
        button.onkeydown = (e) => {
          if (e.key === "Enter") void ipcRenderer.invoke("stash-open", item.id);
        };
        list.append(button);
      }
    },
  );
});
