import { it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OperationLogger } from "../electron/OperationLogger";
import { sanitizeOperation } from "../src/core/OperationLog";
it("日志只允许操作类型和安全元数据，丢弃网址标题及输入内容", () => {
  const raw = {
    slot: 0,
    value: 25,
    muted: true,
    url: "https://secret.example/private",
    title: "秘密标题",
    input: "password",
    name: "收藏名称",
    error: "failed https://private",
    area: "https://private",
    control: "secret",
    status: "https://private",
    action: "https://private",
  };
  expect(sanitizeOperation("audio.page_change", raw)).toEqual({
    event: "audio.page_change",
    details: { slot: 0, value: 25, muted: true },
  });
  expect(sanitizeOperation("https://private", raw)).toBeNull();
});
it("每次启动独立文件，版本时间命名，正常结束完整且结束后不再写入", () => {
  const folder = mkdtempSync(join(tmpdir(), "mvb-logs-")),
    a = new OperationLogger(folder, "0.1.1.0"),
    b = new OperationLogger(folder, "0.1.1.0");
  expect(a.file).not.toBe(b.file);
  expect(a.file).toContain("V0.1.1.0_");
  a.write("web.navigate", { url: "https://secret.example", slot: 2 });
  a.end();
  a.end();
  a.write("ui.click", {});
  b.end();
  const text = readFileSync(a.file, "utf8"),
    rows = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  expect(text).not.toContain("secret");
  expect(rows.map((r) => r.event)).toEqual([
    "session.start",
    "web.navigate",
    "session.end",
  ]);
  expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
});
