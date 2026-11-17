import {
  readdirSync,
  writeFileSync,
  mkdirSync,
  openSync,
  closeSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { artifactOutputPath } from "../lib/test-artifacts.mjs";

// Default output stays with diagnostics. An explicit path supports requested snapshots.
const output = process.argv[2]
  ? resolve(process.argv[2])
  : artifactOutputPath("project-file-tree.txt");
mkdirSync(dirname(output), { recursive: true });
closeSync(openSync(output, "a"));
const root = process.cwd();
const lines = [root, "包含隐藏文件及生成目录；符号链接只列出，不递归。", ""];
let count = 0;
function walk(directory, prefix) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) =>
        Number(b.isDirectory()) - Number(a.isDirectory()) ||
        a.name.localeCompare(b.name),
    );
  } catch (error) {
    lines.push(prefix + `[无法读取：${error.code || "unknown"}]`);
    return;
  }
  entries.forEach((entry, index) => {
    const last = index === entries.length - 1;
    lines.push(
      prefix +
        (last ? "└── " : "├── ") +
        entry.name +
        (entry.isSymbolicLink() ? " [链接]" : entry.isDirectory() ? "/" : ""),
    );
    count++;
    if (entry.isDirectory() && !entry.isSymbolicLink())
      walk(join(directory, entry.name), prefix + (last ? "    " : "│   "));
  });
}
walk(root, "");
writeFileSync(output, lines.join("\n") + "\n");
console.log(`Generated ${count} entries: ${output}`);
