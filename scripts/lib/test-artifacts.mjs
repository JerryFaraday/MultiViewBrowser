import { mkdirSync, renameSync, existsSync } from "node:fs";
import { basename, resolve, sep, extname } from "node:path";
import { randomUUID } from "node:crypto";
/** Test-only outputs; commands run from the repository root, as do existing build scripts. */
export const artifactRoot = resolve(
  process.env.MVB_TEST_ARTIFACT_ROOT || "test-artifacts",
);
// Child probes inherit one batch ID; filenames never determine archive directories.
export const artifactRunId =
  process.env.MVB_TEST_RUN_ID ||
  new Date().toISOString().replace(/[:.]/g, "-") +
    "-" +
    randomUUID().slice(0, 8);
if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(artifactRunId))
  throw Error("Invalid test run ID");
process.env.MVB_TEST_RUN_ID = artifactRunId;
export function artifactModule(filename) {
  const name = basename(filename);
  const groups = [
    [/^(scrollbar)/, "scrollbar"],
    [/^(settings|design-system)/, "settings"],
    [/^startup/, "startup"],
    [/^stash/, "stash"],
    [/^(ui|scale-popup)/, "ui"],
    [/^(video-resize|resize)/, "video-resize"],
    [/^watchlater/, "watchlater"],
    [/^worker-spawn/, "worker-spawn"],
    [/^appearance/, "appearance"],
    [/^dependencies/, "bookmark-dependencies"],
    [/^(live|favorites-inline)/, "live"],
    [/^(performance|audit-merge)/, "performance"],
    [/^review/, "review"],
    [/^popup/, "popup"],
    [/^bilibili/, "bilibili"],
    [/^(resource|background-throttling)/, "resource"],
    [/^fullscreen/, "fullscreen"],
    [/^interaction/, "interaction"],
    [/^exchange/, "exchange"],
    [/^drag/, "drag"],
    [/^audio/, "audio"],
    [/^lifecycle/, "lifecycle"],
    [/^rooms/, "rooms"],
  ];
  return groups.find(([pattern]) => pattern.test(name))?.[1] || "core";
}
export function artifactPath(filename) {
  if (
    typeof filename !== "string" ||
    filename !== basename(filename) ||
    filename.includes("\\") ||
    filename.includes("/") ||
    !/\.(json|png|log|txt)$/.test(filename)
  )
    throw Error("Invalid test artifact name");
  const directory = resolve(artifactRoot, artifactModule(filename));
  if (!directory.startsWith(artifactRoot + sep))
    throw Error("Invalid artifact directory");
  mkdirSync(directory, { recursive: true });
  return resolve(directory, filename);
}
/** Preserve earlier runs before a writer replaces the stable latest-result path. */
export function artifactOutputPath(filename) {
  const target = artifactPath(filename);
  if (existsSync(target)) {
    const archive = resolve(
      artifactRoot,
      "archive",
      artifactRunId,
      artifactModule(filename),
    );
    mkdirSync(archive, { recursive: true });
    let backup = resolve(archive, filename);
    let sequence = 1;
    while (existsSync(backup)) {
      const extension = extname(filename);
      backup = resolve(
        archive,
        filename.slice(0, -extension.length) + `-${sequence++}` + extension,
      );
    }
    renameSync(target, backup);
  }
  return target;
}
