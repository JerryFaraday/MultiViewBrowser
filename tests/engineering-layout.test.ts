import { it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

it("script imports and package command entrypoints resolve after organization", () => {
  for (const name of readdirSync("scripts", { recursive: true })) {
    if (typeof name !== "string" || !name.endsWith(".mjs")) continue;
    const file = join("scripts", name);
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(
      /(?:from\s*|import\s*\(?\s*)["'](\.[^"']+\.mjs)["']/g,
    )) {
      expect(
        existsSync(resolve(dirname(file), match[1])),
        file + ": " + match[1],
      ).toBe(true);
    }
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  for (const command of Object.values(pkg.scripts) as string[]) {
    for (const match of command.matchAll(/node (scripts\/[^\s]+\.mjs)/g))
      expect(existsSync(match[1]), command).toBe(true);
  }
  expect(pkg.build.directories.output).toBe("release");
  expect(pkg.scripts["pack:validation"]).toContain(
    "--config.directories.output=out/validation",
  );
});

it("compatibility document entries point to a single maintained authority", () => {
  for (const [name, target] of [
    ["USER_GUIDE", "user/user-guide"],
    ["USER_MANUAL", "user/user-guide"],
    ["UI_DESIGN_SYSTEM", "design/ui-design-system"],
    ["MULTIVIEW_DESIGN_SYSTEM", "design/ui-design-system"],
  ]) {
    expect(readFileSync(`docs/${name}.md`, "utf8")).toContain(`(${target}.md)`);
    expect(existsSync(`docs/${target}.md`)).toBe(true);
  }
});
