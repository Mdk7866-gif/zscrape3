import type { PlatformInfo } from "@/lib/platforms";

/**
 * A brand-colored circular logo chip.
 *
 * The icon always sits on its own solid brand color — never the theme
 * surface, and never a semi-transparent tint — so it stays legible both in
 * dark mode (black-on-black marks like X and TikTok) and on top of an
 * arbitrary video thumbnail (VideoDataCard), where a translucent badge would
 * wash out against a bright frame.
 */
export default function PlatformBadge({
  platform,
  size = "md",
}: {
  platform: PlatformInfo;
  size?: "xs" | "sm" | "md";
}) {
  const dims = size === "xs" ? "h-4 w-4" : size === "sm" ? "h-5 w-5" : "h-7 w-7";
  const iconDims = size === "xs" ? "h-2 w-2" : size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5";

  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full text-white shadow-sm ${dims}`}
      style={{ background: platform.color }}
      aria-hidden
    >
      <platform.Icon className={iconDims} />
    </span>
  );
}
