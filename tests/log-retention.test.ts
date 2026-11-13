import { it, expect } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pruneLogs } from "../electron/LogRetention";
it("only removes eligible historical logs and always preserves active log and unrelated files", () => {
  const folder = mkdtempSync(join(tmpdir(), "mvb-retention-")),
    old = join(folder, "MultiViewBrowser_V0.2.0.0_old.log"),
    recent = join(folder, "MultiViewBrowser_V0.2.0.0_recent.log"),
    active = join(folder, "MultiViewBrowser_V0.2.0.0_active.log"),
    config = join(folder, "config.json");
  for (const p of [old, recent, active, config]) writeFileSync(p, "test");
  const date = new Date(Date.now() - 40 * 86400000);
  utimesSync(old, date, date);
  utimesSync(active, date, date);
  expect(pruneLogs(folder, active, 30)).toBe(1);
  expect(existsSync(old)).toBe(false);
  expect(existsSync(recent)).toBe(true);
  expect(existsSync(active)).toBe(true);
  expect(pruneLogs(folder, active, 0)).toBe(1);
  expect(existsSync(active)).toBe(true);
  expect(existsSync(config)).toBe(true);
});
