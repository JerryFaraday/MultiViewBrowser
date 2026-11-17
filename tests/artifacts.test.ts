import { it, expect } from "vitest";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  artifactPath,
  artifactOutputPath,
  artifactRoot,
  artifactRunId,
} from "../scripts/lib/test-artifacts.mjs";
it("test artifacts share module paths, create directories, and preserve previous runs", () => {
  const target = artifactOutputPath("worker-spawn-path-test-results.json");
  writeFileSync(target, "old");
  const next = artifactOutputPath("worker-spawn-path-test-results.json");
  expect(next).toBe(target);
  expect(existsSync(next)).toBe(false);
  const archive = resolve(
    artifactRoot,
    "archive",
    artifactRunId,
    "worker-spawn",
  );
  const archives = readdirSync(archive);
  expect(
    archives.some((name) => {
      const p = join(archive, name);
      return existsSync(p) && readFileSync(p, "utf8") === "old";
    }),
  ).toBe(true);
  // A second module and repeated writes share the batch, without overwriting backups.
  writeFileSync(next, "middle");
  artifactOutputPath("worker-spawn-path-test-results.json");
  expect(
    readdirSync(archive).some(
      (name) => readFileSync(join(archive, name), "utf8") === "middle",
    ),
  ).toBe(true);
  const screenshot = artifactOutputPath("settings-path-test.png");
  writeFileSync(screenshot, "image");
  artifactOutputPath("settings-path-test.png");
  expect(
    readFileSync(
      resolve(
        artifactRoot,
        "archive",
        artifactRunId,
        "settings/settings-path-test.png",
      ),
      "utf8",
    ),
  ).toBe("image");
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
    for (const name of readdirSync(dir, { recursive: true }).filter(
      (n): n is string => typeof n === "string" && /\.(mjs|ts)$/.test(n),
    )) {
      const text = readFileSync(join(dir, name), "utf8");
      expect(text, dir + "/" + name).not.toMatch(/\bwriteFileSync\(\s*["'`]/);
      expect(text, dir + "/" + name).not.toContain(
        "out/performance-validation",
      );
    }
  }
});
