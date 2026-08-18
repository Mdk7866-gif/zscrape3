import type { IconType } from "react-icons";
import {
  FaYoutube,
  FaInstagram,
  FaReddit,
  FaXTwitter,
  FaFacebook,
  FaTiktok,
  FaVimeoV,
} from "react-icons/fa6";
import { SiDailymotion } from "react-icons/si";

export interface PlatformInfo {
  name: string;
  /** Matches the `platform` string the backend stores on a video (see
   *  `_get_platform()` in `yt_dlpextractmetadataofvideo.py`). */
  slug: string;
  Icon: IconType;
  /** Official brand color, used as the icon-badge background so every logo
   *  reads clearly regardless of the app's light/dark theme. */
  color: string;
}

/**
 * The platforms zscrape extracts and downloads from. Shared by the home page
 * marquee, the hero mock, and VideoDataCard's on-thumbnail badge, so all
 * three show the same real brand logos instead of independently-invented
 * text pills.
 */
export const PLATFORMS: PlatformInfo[] = [
  { name: "YouTube", slug: "youtube", Icon: FaYoutube, color: "#FF0000" },
  { name: "Instagram", slug: "instagram", Icon: FaInstagram, color: "#E1306C" },
  { name: "Reddit", slug: "reddit", Icon: FaReddit, color: "#FF4500" },
  { name: "X / Twitter", slug: "twitter", Icon: FaXTwitter, color: "#000000" },
  { name: "Facebook", slug: "facebook", Icon: FaFacebook, color: "#1877F2" },
  { name: "TikTok", slug: "tiktok", Icon: FaTiktok, color: "#000000" },
  { name: "Vimeo", slug: "vimeo", Icon: FaVimeoV, color: "#1AB7EA" },
  { name: "Dailymotion", slug: "dailymotion", Icon: SiDailymotion, color: "#0AB0E9" },
];

/**
 * Looks up a platform by the backend's `platform` string. Case-insensitive,
 * and also matches "x" on its own since some callers store that instead of
 * "twitter". Returns undefined for anything not in the list above (the
 * backend's fallback is the yt-dlp extractor key, e.g. "vimeo" already
 * matches, but something truly unrecognized won't).
 */
export function getPlatform(slug: string | undefined | null): PlatformInfo | undefined {
  if (!slug) return undefined;
  const s = slug.toLowerCase();
  if (s === "x") return PLATFORMS.find((p) => p.slug === "twitter");
  return PLATFORMS.find((p) => p.slug === s);
}
