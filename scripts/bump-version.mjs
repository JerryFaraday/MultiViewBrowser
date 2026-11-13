import { readFileSync, writeFileSync } from "node:fs";
import { nextVersion } from "./version-policy.mjs";
const info = JSON.parse(
  readFileSync(new URL("../version.json", import.meta.url), "utf8"),
);
if (!/^\d+\.\d+\.\d+\.\d+$/.test(info.version))
  throw Error("Invalid four-part version");
const args = process.argv.slice(2),
  value = (flag) =>
    args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
info.version = nextVersion(info.version, {
  kind: value("--kind"),
  set: value("--set")?.replace(/^V/, ""),
  authorized: args.includes("--authorized"),
  auditConfirmed: args.includes("--audit-confirmed"),
});
const parts = info.version.split(".").map(Number);
const packageUrl = new URL("../package.json", import.meta.url),
  pkg = JSON.parse(readFileSync(packageUrl, "utf8"));
pkg.version = parts.slice(0, 3).join(".");
pkg.build.buildVersion = info.version;
pkg.shortVersionWindows = info.version;
pkg.build.artifactName = `MultiViewBrowser-V${info.version}-\${arch}.\${ext}`;
writeFileSync(
  new URL("../version.json", import.meta.url),
  JSON.stringify(info, null, 2) + "\n",
);
writeFileSync(packageUrl, JSON.stringify(pkg, null, 2) + "\n");
const lockUrl = new URL("../package-lock.json", import.meta.url),
  lock = JSON.parse(readFileSync(lockUrl, "utf8"));
lock.version = pkg.version;
if (lock.packages?.[""]) lock.packages[""].version = pkg.version;
writeFileSync(lockUrl, JSON.stringify(lock, null, 2) + "\n");
console.log("V" + info.version);
for (const [file, pattern] of [
  ["README.md", /(功能版本为 \*\*)V\d+\.\d+\.\d+\.\d+/],
  ["docs/USER_GUIDE.md", /(^适用)V\d+\.\d+\.\d+\.\d+/m],
]) {
  const url = new URL("../" + file, import.meta.url),
    content = readFileSync(url, "utf8");
  writeFileSync(
    url,
    content.replace(pattern, (_match, prefix) => prefix + "V" + info.version),
  );
}
