export const windowName = (slot: number) =>
  slot === 0 ? "主窗口" : `${slot + 1}号窗口`;
export const windowShortName = (slot: number) =>
  slot === 0 ? "主" : String(slot + 1);
