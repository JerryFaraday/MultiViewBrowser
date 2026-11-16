import { buildSync, transformSync } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
const load = (code) => {
  const module = { exports: {} };
  new Function("module", "exports", code)(module, module.exports);
  return module.exports;
};
const baseline = process.argv[2] ?? "6aee48722ec01d6a5496c74f1bfd4a99e0ddf193";
const previous = load(
  transformSync(
    execFileSync("git", ["show", baseline + ":src/core/ConfigMerge.ts"], {
      encoding: "utf8",
    }),
    { loader: "ts", format: "cjs" },
  ).code,
).mergeConfig;
const current = load(
  transformSync(readFileSync("src/core/ConfigMerge.ts", "utf8"), {
    loader: "ts",
    format: "cjs",
  }).code,
).mergeConfig;
const { defaults } = load(
  buildSync({
    stdin: {
      contents: 'export {defaults} from "./src/core/WorkspaceManager"',
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
  }).outputFiles[0].text,
);
const rows = [];
for (const count of [100, 1000, 5000]) {
  const base = defaults();
  base.favorites = Array.from({ length: count }, (_, i) => ({
    id: String(i),
    name: "f",
    category: "web",
    roomId: "",
    liveCache: null,
    url: "https://example.com/",
    group: "常用",
    note: "",
    created: "",
  }));
  const draft = structuredClone(base),
    latest = structuredClone(base);
  draft.favorites[0].name = "local";
  latest.favorites[count - 1].note = "remote";
  const row = { count };
  for (const [label, merge] of [
    ["baseline", previous],
    ["current", current],
  ]) {
    merge(base, draft, latest);
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const result = merge(base, draft, latest);
      samples.push(performance.now() - start);
      if (
        result.favorites[0].name !== "local" ||
        result.favorites[count - 1].note !== "remote"
      )
        throw Error("merge correctness");
    }
    samples.sort((a, b) => a - b);
    row[label] = { medianMs: samples[2], maxMs: samples[4] };
  }
  rows.push(row);
}
const result = {
  baseline,
  node: process.version,
  fixture:
    "two independent favorite field edits; 1 warm-up, 5 samples; milliseconds",
  rows,
};
writeFileSync("audit-merge-results.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
