import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
if (process.platform !== "win32") throw Error("Windows C++ build required");
const vswhere = join(
  process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)",
  "Microsoft Visual Studio/Installer/vswhere.exe",
);
const vs = JSON.parse(
  execFileSync(
    vswhere,
    [
      "-latest",
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-format",
      "json",
    ],
    { encoding: "utf8" },
  ),
)[0]?.installationPath;
if (!vs)
  throw Error(
    "Install Visual Studio C++ Build Tools and Windows SDK before building",
  );
const latest = (p) =>
  readdirSync(p)
    .filter((x) => /^\d+\./.test(x))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
const tools = join(vs, "VC/Tools/MSVC"),
  vc = join(tools, latest(tools)),
  sdk = join(
    process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)",
    "Windows Kits/10",
  ),
  version = latest(join(sdk, "Include"));
const compiler = join(vc, "bin/Hostx64/x64/cl.exe");
if (!existsSync(compiler)) throw Error("x64 C++ compiler missing");
mkdirSync("dist-native", { recursive: true });
const result = spawnSync(
  compiler,
  [
    "/nologo",
    "/std:c++20",
    "/EHsc",
    "/MT",
    "/O2",
    "/Fe:dist-native/LiveStatus.exe",
    "/Fo:dist-native/LiveStatus.obj",
    "native/live-status.cpp",
    "/link",
    "winhttp.lib",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      INCLUDE: [
        join(vc, "include"),
        ...["ucrt", "shared", "um"].map((x) =>
          join(sdk, "Include", version, x),
        ),
      ].join(";"),
      LIB: [
        join(vc, "lib/x64"),
        ...["ucrt", "um"].map((x) => join(sdk, "Lib", version, x, "x64")),
      ].join(";"),
    },
  },
);
if (result.error || result.status !== 0)
  throw Error("Native live-status build failed");
