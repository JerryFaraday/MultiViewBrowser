import { it, expect } from "vitest";
import { visibleSelection } from "../src/core/Selection";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
import { presets } from "../src/core/LayoutManager";
it("N07 keeps visible page identity, falls back to active then first visible slot", () => {
  const c = defaults();
  const a = newPage("https://a.example"),
    b = newPage("https://b.example");
  c.session.pages = [b, a];
  expect(visibleSelection(c.session, 0, a.id)).toBe(1);
  c.session.tree = presets[0].tree;
  expect(visibleSelection(c.session, 8, a.id)).toBe(0);
  c.session.pages = [];
  expect(visibleSelection(c.session, 8, a.id)).toBe(0);
});

it("N07 structural replacement prefers an active page over a formerly empty slot", () => {
  const c = defaults();
  c.session.pages = [null, newPage("https://b.example")];
  expect(visibleSelection(c.session, 0, undefined, true)).toBe(1);
  expect(visibleSelection(c.session, 0)).toBe(0);
});
