import { it, expect } from "vitest";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  artifactPath,
  artifactOutputPath,
  artifactRoot,
} from "../scripts/test-artifacts.mjs";
it("test artifacts share module paths, create directories, and preserve previous runs", () => {
  const target = artifactOutputPath("worker-spawn-path-test-results.json");
  writeFileSync(target, "old");
  const next = artifactOutputPath("worker-spawn-path-test-results.json");
  expect(next).toBe(target);
  expect(existsSync(next)).toBe(false);
  const archives = readdirSync(resolve(artifactRoot, "worker-spawn/archive"));
  expect(
    archives.some((dir) => {
      const p = join(
        artifactRoot,
        "worker-spawn/archive",
        dir,
        "worker-spawn-path-test-results.json",
      );
      return existsSync(p) && readFileSync(p, "utf8") === "old";
    }),
  ).toBe(true);
  writeFileSync(next, "new");
  expect(
    readFileSync(artifactPath("worker-spawn-path-test-results.json"), "utf8"),
  ).toBe("new");
  expect(artifactPath("settings-smoke.png")).toContain(
    join(artifactRoot, "settings"),
  );
  expect(() => artifactPath("../config.json")).toThrow();
});

it("test and diagnostic writers cannot silently reintroduce literal root outputs", () => {
  for (const dir of ["scripts", "tests/electron"]) {
    for (const name of readdirSync(dir).filter((n) => /\.(mjs|ts)$/.test(n))) {
      const text = readFileSync(join(dir, name), "utf8");
      expect(text, dir + "/" + name).not.toMatch(/\bwriteFileSync\(\s*["'`]/);
      expect(text, dir + "/" + name).not.toContain(
        "out/performance-validation",
      );
    }
  }
});
