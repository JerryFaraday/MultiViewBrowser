import type { Config } from "../src/core/model";
import { isMuted } from "../src/core/AudioManager";
import { logOperation } from "./OperationLogger";
export function logConfigChanges(before: Config, after: Config) {
  if (
    before.masterVolume !== after.masterVolume ||
    before.masterMuted !== after.masterMuted
  )
    logOperation("audio.master_change", {
      previous: before.masterVolume,
      value: after.masterVolume,
      muted: after.masterMuted,
    });
  after.session.pages.forEach((p, slot) => {
    const old = before.session.pages[slot];
    if (!p) return;
    if (p.volume !== old?.volume || p.audio !== old?.audio)
      logOperation("audio.page_change", {
        slot,
        previous: old?.volume,
        value: p.volume,
        muted: isMuted(p, slot),
      });
    if (old?.id === p.id && old.url !== p.url)
      logOperation("web.navigate", { slot, status: "requested" });
  });
  if (
    JSON.stringify(before.session.tree) !== JSON.stringify(after.session.tree)
  )
    logOperation("config.change", { control: "layout", changed: true });
  for (const [key, control] of [
    ["favorites", "favorite"],
    ["groups", "group"],
    ["layouts", "layout"],
    ["workspaces", "workspace"],
  ] as const)
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      logOperation("config.change", {
        control,
        count: after[key].length,
        changed: true,
      });
}
