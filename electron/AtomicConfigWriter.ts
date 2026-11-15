import { writeFile, copyFile, rename } from "node:fs/promises";
/** Serial atomic replacements; one latest snapshot, never concurrent temp writers. */
export class AtomicConfigWriter {
  private pending?: string;
  private timer?: ReturnType<typeof setTimeout>;
  private flight?: Promise<void>;
  constructor(
    private file: string,
    private validMain: boolean,
    private delay = 350,
    private failed = () => {},
  ) {}
  schedule(data: string) {
    this.pending = data;
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => void this.flush().catch(this.failed),
      this.delay,
    );
    this.timer.unref?.();
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.flight) return this.flight.then(() => this.flush());
    if (this.pending === undefined) return Promise.resolve();
    const data = this.pending;
    this.pending = undefined;
    this.flight = (async () => {
      try {
        await writeFile(this.file + ".tmp", data, "utf8");
        if (this.validMain) await copyFile(this.file, this.file + ".bak");
        await rename(this.file + ".tmp", this.file);
        this.validMain = true;
      } catch (error) {
        if (this.pending === undefined) this.pending = data;
        throw error;
      } finally {
        this.flight = undefined;
      }
    })();
    return this.flight.then(() => this.flush());
  }
}
