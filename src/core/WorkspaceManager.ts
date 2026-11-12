import { presets } from "./LayoutManager";
import type { Config } from "./model";
export function defaults(): Config {
  return {
    version: 1,
    revision: 0,
    restore: true,
    bookmarksBar: false,
    masterVolume: 100,
    masterMuted: false,
    session: {
      tree: structuredClone(presets[7].tree),
      layoutId: presets[7].id,
      pages: [],
    },
    favorites: [],
    groups: ["常用"],
    layouts: [],
    workspaces: [],
  };
}
