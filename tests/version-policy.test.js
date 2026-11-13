import { it, expect } from "vitest";
import { nextVersion } from "../scripts/version-policy.mjs";
it("bumps one chosen component and resets lower components", () => {
  expect(nextVersion("0.2.3.9", { kind: "feature" })).toBe("0.2.4.0");
  expect(nextVersion("0.2.3.9", { kind: "revision" })).toBe("0.2.3.10");
  expect(nextVersion("0.2.3.9", { kind: "none" })).toBe("0.2.3.9");
});
it("requires explicit authorization and audit completion", () => {
  expect(() => nextVersion("0.1.1.15", { set: "0.2.0.0" })).toThrow();
  expect(nextVersion("0.1.1.15", { set: "0.2.0.0", authorized: true })).toBe(
    "0.2.0.0",
  );
  expect(() => nextVersion("0.2.0.0", { kind: "audit" })).toThrow();
  expect(nextVersion("0.2.0.0", { kind: "audit", auditConfirmed: true })).toBe(
    "0.2.1.0",
  );
  expect(() => nextVersion("0.2.0.0")).toThrow();
  expect(() =>
    nextVersion("0.2.0.0", { set: "1.2.3.4", authorized: true }),
  ).toThrow();
});
