import { it, expect } from "vitest";
import { mediaDocuments } from "../electron/media-documents";
it("发现嵌套同源播放器但不读取跨域文档，避免循环", () => {
  const root = {
    querySelectorAll: () => [
      { contentDocument: child },
      {
        get contentDocument() {
          throw Error("cross origin");
        },
      },
    ],
  } as unknown as Document;
  const child = {
    querySelectorAll: () => [{ contentDocument: root }],
  } as unknown as Document;
  expect(mediaDocuments(root)).toEqual([root, child]);
});
