type IconName =
  | "settings"
  | "arrow-left"
  | "sliders-horizontal"
  | "globe"
  | "star"
  | "palette"
  | "database"
  | "info";
const paths: Record<IconName, React.ReactNode> = {
  settings: (
    <>
      <path d="m9.5 3-.6 2.1-2 .9-2-.6-2.5 4.2L4 11v2l-1.6 1.4L5 18.6l2-.6 2 .9.5 2.1h5l.6-2.1 2-.9 2 .6 2.5-4.2L20 13v-2l1.6-1.4L19 5.4l-2 .6-2-.9L14.5 3z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "arrow-left": (
    <>
      <path d="m12 5-7 7 7 7M5 12h14" />
    </>
  ),
  "sliders-horizontal": (
    <>
      <path d="M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10M7 3v6m10 0v6M7 15v6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  star: (
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 1.7-4.3 1.5 1.5 0 0 1 1.1-2.6H18A3 3 0 0 0 21 11a9 9 0 0 0-9-8Z" />
      <circle cx="7.5" cy="10" r=".5" />
      <circle cx="10" cy="6.5" r=".5" />
      <circle cx="15" cy="6.5" r=".5" />
      <circle cx="18" cy="10" r=".5" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
};
export function SettingsIcon({ name }: { name: IconName }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon={name}
    >
      {paths[name]}
    </svg>
  );
}
export const categoryIcons: Record<string, IconName> = {
  常规: "sliders-horizontal",
  网页浏览: "globe",
  收藏栏: "star",
  外观: "palette",
  数据与隐私: "database",
  关于与诊断: "info",
};
