import { describe, it, expect } from "vitest";
import { defaults } from "../src/core/WorkspaceManager";
import { newPage } from "../src/core/model";
import { parkPage, placeStashed, reorderStash } from "../src/core/PageStash";
describe("page stash transfers", () => {
  it("moves entries both directions without changing instances", () => {
    const c = defaults();
    c.pageStash = ["a", "b", "c"].map((id) => ({
      id,
      title: id,
      url: "https://example.com/" + id,
    }));
    expect(reorderStash(c, "a", "c")).toBe(true);
    expect(c.pageStash.map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(reorderStash(c, "a", "b")).toBe(true);
    expect(c.pageStash.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(reorderStash(c, "missing", "c")).toBe(false);
  });
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
