import { copyFileSync } from "node:fs";
import { build } from "esbuild";
await build({
  entryPoints: [
    "electron/main.ts",
    "electron/stash-preload.ts",
    "electron/preload.ts",
    "electron/media-preload.ts",
    "electron/volume-preload.ts",
    "electron/drag-preload.ts",
    "electron/scale-preload.ts",
  ],
  bundle: true,
  platform: "node",
  format: "cjs",
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  external: ["electron"],
});

copyFileSync("electron/volume.html", "dist-electron/volume.html");

copyFileSync("electron/drag.html", "dist-electron/drag.html");
copyFileSync("electron/scale.html", "dist-electron/scale.html");
