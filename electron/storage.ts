import { mergeConfig } from "../src/core/ConfigMerge";
import { AtomicConfigWriter } from "./AtomicConfigWriter";
import { logOperation } from "./OperationLogger";
import {
  bookmarkChildPreferences,
  bookmarkPreferenceDisabled,
} from "../src/core/Preferences";
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
  private writer?: AtomicConfigWriter;
  private signature?: string;
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
    for (const key of bookmarkChildPreferences)
      if (!latest.bookmarksBar && bookmarkPreferenceDisabled(merged, key))
        merged.preferences[key] = latest.preferences[key];
    this.save(merged);
    return merged;
  }
  constructor(
    folder: string,
    private delayMs = 0,
  ) {
    mkdirSync(folder, { recursive: true });
    this.file = join(folder, "config.json");
  }
  load() {
    if (this.delayMs > 0 && this.live)
      return this.remember(structuredClone(this.live));
    for (const file of [this.file, this.file + ".bak"]) {
      try {
        const text = readFileSync(file, "utf8");
        if (file === this.file && this.live && text === this.diskSignature)
          return this.remember(structuredClone(this.live));
        const c = validateConfig(JSON.parse(text));
        this.diskSignature = file === this.file ? text : undefined;
        this.live = structuredClone(c);
        this.signature = JSON.stringify({ ...c, revision: 0 });
        this.savedSession = structuredClone(c.session);
        return this.remember(c);
      } catch {}
    }
    const fallback = defaults();
    this.savedSession = structuredClone(fallback.session);
    return this.remember(fallback);
  }
  save(config: Config, forceSession = false) {
    const before = this.load();
    const signature = JSON.stringify({ ...config, revision: 0 });
    if (
      !forceSession &&
      this.diskSignature !== undefined &&
      signature ===
        (this.signature ?? JSON.stringify({ ...before, revision: 0 }))
    ) {
      config.revision = before.revision;
      return;
    }
    config.revision = before.revision + 1;
    const current = validateConfig(config),
      disk = structuredClone(current);
    if (
      !current.preferences.autoSaveSession &&
      !forceSession &&
      this.savedSession
    )
      disk.session = structuredClone(this.savedSession);
    const data = JSON.stringify(disk, null, 2);
    if (this.delayMs > 0) {
      this.writer ??= new AtomicConfigWriter(
        this.file,
        this.diskSignature !== undefined,
        this.delayMs,
        () => logOperation("app.error", { status: "failed" }),
      );
      this.writer.schedule(data);
    } else {
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
    this.diskSignature = data;
    this.signature = signature;
    this.savedSession = structuredClone(disk.session);
    this.live = structuredClone(current);
    this.remember(config);
  }
  flush() {
    return this.writer?.flush() ?? Promise.resolve();
  }
}
