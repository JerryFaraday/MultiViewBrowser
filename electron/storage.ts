import { mergeConfig } from "../src/core/ConfigMerge";
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
  private history = new Map<number, Config>();
  remember(config: Config) {
    if (!this.history.has(config.revision))
      this.history.set(config.revision, structuredClone(config));
    if (this.history.size > 128)
      this.history.delete(this.history.keys().next().value!);
    return config;
  }
  accept(draft: Config) {
    const latest = this.load();
    const base = this.history.get(draft.revision);
    if (!base) throw Error("配置版本已过期，请重新加载后操作");
    const merged = validateConfig(mergeConfig(base, draft, latest));
    this.save(merged);
    return merged;
  }
  constructor(folder: string) {
    mkdirSync(folder, { recursive: true });
    this.file = join(folder, "config.json");
  }
  load() {
    for (const file of [this.file, this.file + ".bak"]) {
      try {
        return this.remember(
          validateConfig(JSON.parse(readFileSync(file, "utf8"))),
        );
      } catch {}
    }
    return this.remember(defaults());
  }
  save(config: Config) {
    config.revision = this.load().revision + 1;
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
    this.remember(config);
  }
}
