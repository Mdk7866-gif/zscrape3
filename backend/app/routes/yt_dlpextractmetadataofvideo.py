import yt_dlp
import logging

logger = logging.getLogger(__name__)

def extract_video_metadata(url: str) -> dict | None:
    """
    Extracts metadata from a video URL using yt-dlp.
    Returns a dictionary with title, duration_seconds, platform, and thumbnail,
    or None if extraction fails.
    """
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False, # Need full metadata
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info_dict = ydl.extract_info(url, download=False)
            if not info_dict:
                return None
                
            return {
                "title": info_dict.get('title', 'Unknown Title'),
                "duration_seconds": info_dict.get('duration', 0),
                "platform": info_dict.get('extractor', 'unknown'),
                "thumbnail": info_dict.get('thumbnail'),
                "url": url,
            }
    except Exception as e:
        logger.error(f"Failed to extract metadata for {url}: {e}")
        return None
