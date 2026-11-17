export function nextVersion(
  current,
  { kind, set, authorized = false, auditConfirmed = false } = {},
) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(current))
    throw Error("Invalid four-part version");
  const parts = current.split(".").map(Number);
  if (set) {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(set))
      throw Error("Invalid target version");
    const target = set.split(".").map(Number);
    if ((target[0] !== parts[0] || target[1] !== parts[1]) && !authorized)
      throw Error("User authorization required for a/b changes");
    const changed = target.findIndex((p, i) => p !== parts[i]);
    if (
      changed >= 0 &&
      changed < 3 &&
      target.slice(changed + 1).some((p) => p !== 0)
    )
      throw Error("Lower components must reset to zero");
    return set;
  }
  if (kind === "none") return current;
  if (kind === "audit" && !auditConfirmed)
    throw Error("User must confirm audit repair completion");
  if (kind === "feature" || kind === "audit") {
    parts[2]++;
    parts[3] = 0;
  } else if (kind === "revision") parts[3]++;
  else
    throw Error("Choose --kind feature|revision|audit|none, or --set a.b.c.d");
  return parts.join(".");
}
