import type { PlatformInfo } from "@/lib/platforms";

/**
 * A brand-colored circular logo chip.
 *
 * The icon always sits on its own brand color (never the theme surface), so
 * black-on-black marks like X and TikTok stay legible in dark mode too.
 */
export default function PlatformBadge({
  platform,
  size = "md",
}: {
  platform: PlatformInfo;
  size?: "sm" | "md";
}) {
  const dims = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  const iconDims = size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5";

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
