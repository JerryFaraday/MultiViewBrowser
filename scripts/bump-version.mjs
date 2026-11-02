import { readFileSync, writeFileSync } from "node:fs";
const info = JSON.parse(
  readFileSync(new URL("../version.json", import.meta.url), "utf8"),
);
if (!/^\d+\.\d+\.\d+\.\d+$/.test(info.version))
  throw Error("Invalid four-part version");
const parts = info.version.split(".").map(Number);
parts[3]++;
info.version = parts.join(".");
const packageUrl = new URL("../package.json", import.meta.url),
  pkg = JSON.parse(readFileSync(packageUrl, "utf8"));
pkg.version = parts.slice(0, 3).join(".");
pkg.build.buildVersion = info.version;
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
