import { z } from "zod";
export const preferencesSchema = z.object({
  startupWindow: z.enum(["maximized", "last", "normal"]).default("maximized"),
  startupContent: z.enum(["last", "workspace", "blank"]).default("last"),
  defaultWorkspace: z.string().max(100).default(""),
  autoSaveSession: z.boolean().default(true),
  confirmClose: z.enum(["never", "multiple", "always"]).default("never"),
  resolution: z.enum(["1080", "1440", "2160"]).default("1080"),
  scaleMode: z.enum(["auto", "responsive"]).default("auto"),
  pageZoom: z.number().min(0.25).max(5).default(1),
  retryCount: z.number().int().min(0).max(10).default(0),
  showGroupNames: z.boolean().default(false),
  theme: z.enum(["dark", "light", "system"]).default("dark"),
  uiScale: z
    .union([z.literal(0.9), z.literal(1), z.literal(1.1), z.literal(1.25)])
    .default(1),
  tooltips: z.boolean().default(true),
  accent: z.enum(["blue", "teal", "violet"]).default("blue"),
  logRetention: z
    .union([z.literal(0), z.literal(7), z.literal(30), z.literal(90)])
    .default(0),
  permissions: z
    .array(
      z.object({
        origin: z
          .string()
          .max(2048)
          .refine((x) => {
            try {
              const u = new URL(x);
              return u.protocol === "https:" && u.origin === x;
            } catch {
              return false;
            }
          }),
        camera: z.boolean(),
        microphone: z.boolean(),
        notifications: z.boolean(),
      }),
    )
    .max(500)
    .default([]),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const defaultPreferences = () => preferencesSchema.parse({});
export function newPageDefaults<
  T extends {
    scale: { mode: string; width: number; height: number };
    pageZoom: number;
  },
>(page: T, prefs: Preferences): T {
  const height = Number(prefs.resolution);
  return {
    ...page,
    pageZoom: prefs.pageZoom,
    scale: {
      ...page.scale,
      mode: prefs.scaleMode,
      width: Math.round((height * 16) / 9),
      height,
    },
  };
}
export function allowPermission(
  prefs: Preferences,
  origin: string,
  permission: string,
  media: string[] = [],
) {
  try {
    origin = new URL(origin).origin;
  } catch {
    return false;
  }
  const rule = prefs.permissions.find((x) => x.origin === origin);
  if (!rule) return false;
  if (permission === "notifications") return rule.notifications;
  return (
    permission === "media" &&
    media.length > 0 &&
    media.every((x) =>
      x === "video" ? rule.camera : x === "audio" ? rule.microphone : false,
    )
  );
}
