import { readdirSync, lstatSync, unlinkSync } from "node:fs";
import { join } from "node:path";
const logPattern = /^MultiViewBrowser_V\d+\.\d+\.\d+\.\d+_[\w-]+\.log$/;
export function pruneLogs(
  folder: string,
  active: string | undefined,
  days: number,
  now = Date.now(),
) {
  let removed = 0;
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (path === active || !logPattern.test(name)) continue;
    const pid = Number(name.match(/_(\d+)_[a-f0-9]{8}\.log$/)?.[1]);
    if (Number.isSafeInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        continue;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") continue;
      }
    }
    try {
      const stat = lstatSync(path);
      if (
        stat.isFile() &&
        (days === 0 || stat.mtimeMs < now - days * 86400000)
      ) {
        unlinkSync(path);
        removed++;
      }
    } catch {}
  }
  return removed;
}
