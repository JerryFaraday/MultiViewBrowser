import { describe, it, expect } from "vitest";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
import { parkPage, placeStashed } from "../src/core/PageStash";
describe("page stash transfers", () => {
  it("parks and restores the same page even with empty slots", () => {
    const c = defaults();
    c.session.tree = { kind: "leaf", slot: 0 };
    const p = newPage("https://example.com");
    c.session.pages = [p];
    expect(parkPage(c, p.id)).toBe(true);
    expect(c.session.pages[0]).toBeNull();
    expect(placeStashed(c, p.id)).toBe(p.id);
    expect(c.session.pages[0]).toBe(p);
    expect(c.pageStash).toHaveLength(0);
  });
  it("exchanges an occupied target and rejects invalid targets", () => {
    const c = defaults();
    c.session.tree = { kind: "leaf", slot: 0 };
    const a = newPage("https://a.example"),
      b = newPage("https://b.example");
    c.session.pages = [a];
    c.pageStash = [{ id: b.id, url: b.url, title: b.title, page: b }];
    expect(placeStashed(c, b.id)).toBeUndefined();
    expect(placeStashed(c, b.id, 8)).toBeUndefined();
    expect(placeStashed(c, b.id, 0)).toBe(b.id);
    expect(c.session.pages[0]).toBe(b);
    expect(c.pageStash[0].page).toBe(a);
  });
});
