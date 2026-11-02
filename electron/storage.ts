import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { configSchema, type Config } from "../src/core/model";
import { defaults } from "../src/core/WorkspaceManager";
import { validTree } from "../src/core/LayoutManager";
export function validateConfig(raw: unknown): Config {
  const c = configSchema.parse(raw);
  if (
    ![
      c.session.tree,
      ...c.layouts.map((x) => x.tree),
      ...c.workspaces.map((x) => x.snapshot.tree),
    ].every(validTree)
  )
    throw Error("布局槽位不合法");
  return c;
}
export class ConfigStore {
  readonly file: string;
  constructor(folder: string) {
    mkdirSync(folder, { recursive: true });
    this.file = join(folder, "config.json");
  }
  load() {
    for (const file of [this.file, this.file + ".bak"]) {
      try {
        return validateConfig(JSON.parse(readFileSync(file, "utf8")));
      } catch {}
    }
    return defaults();
  }
  save(config: Config) {
    const data = JSON.stringify(validateConfig(config), null, 2);
    const temp = this.file + ".tmp";
    writeFileSync(temp, data, "utf8");
    if (existsSync(this.file)) {
      try {
        validateConfig(JSON.parse(readFileSync(this.file, "utf8")));
        copyFileSync(this.file, this.file + ".bak");
      } catch {}
    }
    renameSync(temp, this.file);
  }
}
