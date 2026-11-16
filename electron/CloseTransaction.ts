export type CloseChoice = "retry" | "cancel" | "discard";
export type ClosePhase = "idle" | "draft" | "accepting" | "persisting" | "done";
/** One close transaction; acceptance failure can never fall through to persistence. */
export class CloseTransaction {
  phase: ClosePhase = "idle";
  private timer?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  constructor(
    private actions: {
      requestDraft(): void;
      accept(raw: unknown): void | Promise<void>;
      persist(): Promise<boolean>;
      failure(stage: "draft" | "disk", retryAllowed: boolean): CloseChoice;
      finish(): void;
    },
    private timeout = 2500,
    private diskTimeout = 10000,
  ) {}
  request() {
    if (this.phase !== "idle") return;
    this.attempts = 0;
    this.requestDraft();
  }
  private requestDraft() {
    this.phase = "draft";
    this.timer = setTimeout(() => this.fail("draft"), this.timeout);
    this.actions.requestDraft();
  }
  async submit(raw: unknown) {
    if (this.phase !== "draft") return;
    clearTimeout(this.timer);
    this.phase = "accepting";
    try {
      await this.actions.accept(raw);
    } catch {
      this.fail("draft");
      return;
    }
    await this.persist();
  }
  private async persist() {
    this.phase = "persisting";
    try {
      const result = await Promise.race([
        this.actions.persist(),
        new Promise<never>((_, reject) => {
          this.timer = setTimeout(
            () => reject(Error("disk timeout")),
            this.diskTimeout,
          );
        }),
      ]);
      clearTimeout(this.timer);
      if (!result) {
        this.phase = "idle";
        return;
      }
      this.phase = "done";
      this.actions.finish();
    } catch {
      clearTimeout(this.timer);
      this.fail("disk");
    }
  }
  private fail(stage: "draft" | "disk") {
    clearTimeout(this.timer);
    const retryAllowed = this.attempts < 2;
    const choice = this.actions.failure(stage, retryAllowed);
    if (choice === "retry" && retryAllowed) {
      this.attempts++;
      if (stage === "draft") this.requestDraft();
      else void this.persist();
    } else if (choice === "discard") {
      this.phase = "done";
      this.actions.finish();
    } else this.phase = "idle";
  }
}
