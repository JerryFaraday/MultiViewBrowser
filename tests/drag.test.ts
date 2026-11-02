import { it, expect } from "vitest";
import { DragSession } from "../src/core/DragSession";
it("远程网页只有在工具栏发起拖动后才可请求交换，且只能消费一次", () => {
  const drag = new DragSession();
  expect(drag.take("target", 10)).toBeNull();
  drag.begin("source", 20);
  expect(drag.take("target", 30)).toBe("source");
  expect(drag.take("target", 40)).toBeNull();
});
it("结束事件与跨进程放下顺序不同仍能交换，过期或同窗口不交换", () => {
  const drag = new DragSession();
  drag.begin("source", 0);
  drag.finish(100);
  expect(drag.take("target", 200)).toBe("source");
  drag.begin("source", 0);
  drag.finish(100);
  expect(drag.take("target", 400)).toBeNull();
  drag.begin("source", 0);
  expect(drag.take("source", 100)).toBeNull();
});
