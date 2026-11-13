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
  private live?: Config;
  private diskSignature?: string;
  private savedSession?: Config["session"];
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
        const text = readFileSync(file, "utf8");
        if (file === this.file && this.live && text === this.diskSignature)
          return this.remember(structuredClone(this.live));
        const c = validateConfig(JSON.parse(text));
        this.diskSignature = file === this.file ? text : undefined;
        this.live = structuredClone(c);
        this.savedSession = structuredClone(c.session);
        return this.remember(c);
      } catch {}
    }
    const fallback = defaults();
    this.savedSession = structuredClone(fallback.session);
    return this.remember(fallback);
  }
  save(config: Config, forceSession = false) {
    config.revision = this.load().revision + 1;
    const current = validateConfig(config),
      disk = structuredClone(current);
    if (
      !current.preferences.autoSaveSession &&
      !forceSession &&
      this.savedSession
    )
      disk.session = structuredClone(this.savedSession);
    const data = JSON.stringify(disk, null, 2);
    const temp = this.file + ".tmp";
    writeFileSync(temp, data, "utf8");
    if (existsSync(this.file)) {
      try {
        validateConfig(JSON.parse(readFileSync(this.file, "utf8")));
        copyFileSync(this.file, this.file + ".bak");
      } catch {}
    }
    renameSync(temp, this.file);
    this.diskSignature = data;
    this.savedSession = structuredClone(disk.session);
    this.live = structuredClone(current);
    this.remember(config);
  }
}
