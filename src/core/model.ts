import { z } from "zod";
export type Tree =
  | { kind: "leaf"; slot: number }
  | { kind: "split"; axis: "x" | "y"; ratios: number[]; children: Tree[] };
export const treeSchema: z.ZodType<Tree> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("leaf"), slot: z.number().int().min(0).max(8) }),
    z
      .object({
        kind: z.literal("split"),
        axis: z.enum(["x", "y"]),
        ratios: z.array(z.number().positive()).min(2).max(9),
        children: z.array(treeSchema).min(2).max(9),
      })
      .refine(
        (t) =>
          t.ratios.length === t.children.length &&
          Math.abs(t.ratios.reduce((a, b) => a + b, 0) - 1) < 0.001,
      ),
  ]),
);
export const pageSchema = z.object({
  id: z.string().max(100),
  url: z
    .string()
    .max(8192)
    .refine((s) => {
      try {
        return ["http:", "https:"].includes(new URL(s).protocol);
      } catch {
        return false;
      }
    }),
  title: z.string().max(1000),
  pageZoom: z.number().min(0.25).max(5).default(1),
  audio: z.enum(["auto", "muted", "unmuted"]),
  volume: z
    .union([
      z.literal(0),
      z.literal(25),
      z.literal(50),
      z.literal(75),
      z.literal(100),
    ])
    .default(100),
  scale: z.object({
    mode: z.enum(["auto", "manual", "responsive"]),
    width: z.number().min(320).max(7680),
    height: z.number().min(240).max(4320),
    factor: z.number().min(0.05).max(3),
  }),
});
export type Page = z.infer<typeof pageSchema>;
export const snapshotSchema = z.object({
  tree: treeSchema,
  pages: z
    .array(pageSchema.nullable())
    .max(24)
    .refine((pages) => {
      const ids = pages.flatMap((p) => (p ? [p.id] : []));
      return new Set(ids).size === ids.length;
    }, "网页 ID 不可重复"),
  layoutId: z.string(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const favoriteSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  url: pageSchema.shape.url,
  group: z.string().max(100),
  note: z.string().max(2000),
  created: z.string(),
});
export const configSchema = z.object({
  version: z.literal(1),
  restore: z.boolean(),
  bookmarksBar: z.boolean().default(false),
  masterMuted: z.boolean().default(false),
  masterVolume: z.number().min(0).max(150).default(100),
  session: snapshotSchema,
  groups: z.array(z.string().max(100)).max(200),
  favorites: z.array(favoriteSchema).max(5000),
  layouts: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        tree: treeSchema,
        created: z.string(),
        modified: z.string(),
      }),
    )
    .max(200),
  workspaces: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        snapshot: snapshotSchema,
        created: z.string(),
        modified: z.string(),
      }),
    )
    .max(200),
});
export type Config = z.infer<typeof configSchema>;
export function newPage(url: string): Page {
  return {
    id: crypto.randomUUID(),
    url: normalizeUrl(url),
    title: "新网页",
    pageZoom: 1,
    audio: "auto",
    volume: 100,
    scale: { mode: "auto", width: 1920, height: 1080, factor: 1 },
  };
}
export function normalizeUrl(input: string) {
  const u = new URL(input.includes("://") ? input : "https://" + input);
  if (!["https:", "http:"].includes(u.protocol))
    throw Error("仅允许 HTTP / HTTPS 地址");
  return u.href;
}
