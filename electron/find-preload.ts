import { ipcRenderer } from "electron";
window.addEventListener("DOMContentLoaded", () => {
  const input = document.querySelector("input")!;
  const send = (action: string) =>
    ipcRenderer.send("find-command", action, input.value);
  input.addEventListener("input", () => send("input"));
  document
    .querySelectorAll("button")
    .forEach((button) => (button.onclick = () => send(button.dataset.action!)));
  document.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      send("close");
    } else if (
      event.key === "Enter" ||
      (event.ctrlKey && event.key.toLowerCase() === "g")
    ) {
      event.preventDefault();
      send(event.shiftKey ? "previous" : "next");
    }
  });
  ipcRenderer.on("find-focus", (_e, query) => {
    input.value = query;
    input.focus();
    input.select();
  });
  ipcRenderer.on("find-result", (_e, ordinal, total) => {
    document.querySelector("output")!.textContent = ordinal + "/" + total;
  });
});
