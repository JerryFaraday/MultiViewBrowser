import type { LiveState, LiveStates } from "../../src/core/LiveStatus";
type Entry = {
  state: LiveState;
  successAt: number;
  failures: number;
  failureRound: number;
};
// One failed round may retain a recent result; two failed rounds or expiry cannot.
export class LiveDisplay {
  private entries = new Map<string, Entry>();
  validForMs = 150000;
  retain(keys: Set<string>) {
    for (const key of this.entries.keys())
      if (!keys.has(key)) this.entries.delete(key);
  }
  accept(key: string, state: LiveState, round: number, now = Date.now()) {
    if (state.reason === "replay")
      state = { status: "offline", reason: "replay" };
    const old = this.entries.get(key);
    if (state.status !== "unknown")
      this.entries.set(key, {
        state,
        successAt: now,
        failures: 0,
        failureRound: -1,
      });
    else if (state.reason !== "pending") {
      const failures =
        (old?.failures ?? 0) + (old?.failureRound === round ? 0 : 1);
      this.entries.set(key, {
        state:
          old && failures < 2 && now - old.successAt < this.validForMs
            ? old.state
            : state,
        successAt: old?.successAt ?? -Infinity,
        failures,
        failureRound: round,
      });
    }
  }
  snapshot(keys: Set<string>, now = Date.now()): LiveStates {
    return Object.fromEntries(
      [...keys].map((key) => {
        const e = this.entries.get(key);
        return [
          key,
          e
            ? e.state.status !== "unknown" &&
              now - e.successAt >= this.validForMs
              ? { status: "unknown", reason: "stale" }
              : e.state
            : { status: "unknown", reason: "pending" },
        ];
      }),
    );
  }
  nextExpiry(now = Date.now()) {
    return Math.min(
      Infinity,
      ...[...this.entries.values()]
        .filter(
          (e) =>
            e.state.status !== "unknown" && e.successAt + this.validForMs > now,
        )
        .map((e) => e.successAt + this.validForMs - now),
    );
  }
}
