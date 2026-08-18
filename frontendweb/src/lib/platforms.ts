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
  Icon: IconType;
  /** Official brand color, used as the icon-badge background so every logo
   *  reads clearly regardless of the app's light/dark theme. */
  color: string;
}

/**
 * The platforms zscrape extracts and downloads from. Shared by the home page
 * marquee and the hero mock so both show the same real brand logos instead of
 * plain text pills.
 */
export const PLATFORMS: PlatformInfo[] = [
  { name: "YouTube", Icon: FaYoutube, color: "#FF0000" },
  { name: "Instagram", Icon: FaInstagram, color: "#E1306C" },
  { name: "Reddit", Icon: FaReddit, color: "#FF4500" },
  { name: "X / Twitter", Icon: FaXTwitter, color: "#000000" },
  { name: "Facebook", Icon: FaFacebook, color: "#1877F2" },
  { name: "TikTok", Icon: FaTiktok, color: "#000000" },
  { name: "Vimeo", Icon: FaVimeoV, color: "#1AB7EA" },
  { name: "Dailymotion", Icon: SiDailymotion, color: "#0AB0E9" },
];
