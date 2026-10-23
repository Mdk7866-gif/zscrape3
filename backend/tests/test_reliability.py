"""Offline regression checks: no real credentials, database calls, or downloads."""

import asyncio
import io
import json
import os
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stderr
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

# Set only test-process configuration before importing route modules.
os.environ["SUPABASE_URL"] = "https://example.supabase.co"
os.environ["SUPABASE_SECRET_KEY"] = "test-key"

import yt_dlp
from fastapi import HTTPException

from app import ytdlp_common
from app.platforms import get_platform
from app.routes import crudvideos, downloads
from app.schemas.video import BulkVideoUploadRequest


class PlatformTests(unittest.TestCase):
    def test_hostnames_and_misleading_url_text(self):
        cases = {
            "https://m.youtube.com/watch?v=1": "youtube",
            "https://youtu.be/1": "youtube",
            "https://old.reddit.com/r/test/comments/abc/": "reddit",
            "https://v.redd.it/abc": "reddit",
            "https://X.COM/user/status/1": "twitter",
            "https://instagram.com/reel/abc": "instagram",
            "https://fb.watch/abc": "facebook",
            "https://vm.tiktok.com/abc": "tiktok",
            "https://example.com/?next=https://youtube.com": "other",
            "https://notyoutube.com/watch": "other",
            "https://reddit.com.example.org/": "other",
            "https://youtube.com@example.org/": "other",
            "https://[broken": "other",
            "file://reddit.com/video": "other",
        }
        for url, expected in cases.items():
            with self.subTest(url=url):
                self.assertEqual(get_platform(url), expected)


class ExtractorTests(unittest.TestCase):
    def test_cookie_retry_and_options_are_preserved(self):
        primary, retry = MagicMock(), MagicMock()
        primary.__enter__.return_value.extract_info.side_effect = Exception("Sign in to confirm your age")
        retry.__enter__.return_value.extract_info.return_value = {"id": "video"}
        opts = {"extractor_args": {"custom": {"key": ["value"]}}}
        with patch.object(ytdlp_common, "HAS_COOKIES", True), patch.object(
            ytdlp_common, "_create_ytdlp", side_effect=[primary, retry],
        ) as create:
            result = ytdlp_common.extract_with_youtube_fallback(
                opts, "https://youtu.be/video", "other", download=True,
            )
        self.assertEqual(result["id"], "video")
        self.assertNotIn("cookiefile", opts)
        fallback = create.call_args_list[1].args[0]
        self.assertEqual(fallback["cookiefile"], ytdlp_common.COOKIE_PATH)
        self.assertEqual(fallback["extractor_args"]["custom"], opts["extractor_args"]["custom"])

    def test_reddit_impersonates_without_mutating_options_or_retrying(self):
        opts = {}
        with patch.object(ytdlp_common, "_create_ytdlp") as create:
            create.return_value.__enter__.return_value.extract_info.side_effect = Exception("403")
            with self.assertRaisesRegex(Exception, "403"):
                ytdlp_common.extract_with_youtube_fallback(
                    opts, "https://reddit.com/r/test/comments/abc/", "reddit", download=True,
                )
        self.assertEqual(create.call_count, 1)
        self.assertEqual(create.call_args.args[0]["impersonate"].client, "chrome")
        self.assertEqual(opts, {})

    def test_constructor_is_serialized(self):
        barrier = threading.Barrier(5)
        def construct(_):
            barrier.wait()
            with ytdlp_common._create_ytdlp({"quiet": True}):
                return True
        errors = io.StringIO()
        with redirect_stderr(errors), ThreadPoolExecutor(max_workers=5) as pool:
            self.assertTrue(all(pool.map(construct, range(5))))
        self.assertNotIn("already registered", errors.getvalue())


class DownloadTests(unittest.TestCase):
    def job(self):
        return {"job_id": "test", "video_id": "test", "status": "queued",
                "url": "https://reddit.com/r/test/comments/abc/",
                "cancel_event": threading.Event()}

    def test_setup_errors_become_terminal_failures(self):
        for target in ("resolve_share_url", "_get_ydl_opts"):
            job = self.job()
            with patch.object(downloads, target, side_effect=OSError("setup failed")):
                downloads._download_sync(job)
            self.assertEqual(job["status"], "failed")
            self.assertEqual(job["error"], "setup failed")
            self.assertFalse(os.path.exists(job.get("tmp_dir") or "nonexistent"))

    def test_missing_ffmpeg_fails_before_network(self):
        job = self.job()
        with patch.object(downloads.shutil, "which", return_value=None), patch.object(
            downloads, "extract_with_youtube_fallback",
        ) as extract:
            downloads._download_sync(job)
        extract.assert_not_called()
        self.assertEqual(job["status"], "failed")
        self.assertIn("FFmpeg", job["error"])

    def test_media_denial_and_cleanup(self):
        job = self.job()
        with patch.object(downloads.shutil, "which", return_value="ffmpeg"), patch.object(
            downloads, "extract_with_youtube_fallback",
            side_effect=yt_dlp.utils.DownloadError("unable to download video data: HTTP Error 403"),
        ):
            downloads._download_sync(job)
        self.assertEqual(job["status"], "failed")
        self.assertIn("original video", job["error"])
        self.assertFalse(os.path.exists(job["tmp_dir"]))

    def test_cancellation_preserves_terminal_results(self):
        for status in ("completed", "failed", "cancelled"):
            job = self.job()
            job["status"] = status
            with patch.dict(downloads.jobs, {"test": job}, clear=True):
                self.assertEqual(downloads.cancel_download("test")["status"], status)
            self.assertFalse(job["cancel_event"].is_set())

    def test_completed_file_and_size_are_recorded(self):
        job = self.job()
        def extract(opts, *args, **kwargs):
            path = opts["outtmpl"].replace("%(ext)s", "mp4")
            with open(path, "wb") as output:
                output.write(b"test media")
            return {"requested_downloads": [{"filepath": path}]}
        with patch.object(downloads.shutil, "which", return_value="ffmpeg"), patch.object(
            downloads, "extract_with_youtube_fallback", side_effect=extract,
        ), patch.object(downloads, "supabase") as database:
            try:
                downloads._download_sync(job)
                self.assertEqual(job["status"], "completed")
                self.assertEqual(job["actual_size"], 10)
                database.table.assert_called_with("videos")
            finally:
                downloads._delete_path(job.get("tmp_dir"))

    def test_unmerged_video_is_not_reported_as_completed(self):
        job = self.job()
        def extract(opts, *args, **kwargs):
            path = opts["outtmpl"].replace("%(ext)s", "f137.mp4")
            with open(path, "wb") as output:
                output.write(b"unmerged video")
            return {}
        with patch.object(downloads.shutil, "which", return_value="ffmpeg"), patch.object(
            downloads, "extract_with_youtube_fallback", side_effect=extract,
        ):
            downloads._download_sync(job)
        self.assertEqual(job["status"], "failed")
        self.assertIn("completed MP4", job["error"])
        self.assertFalse(os.path.exists(job["tmp_dir"]))

    def test_cancel_during_transfer_cleans_up(self):
        job = self.job()
        def extract(*args, **kwargs):
            job["cancel_event"].set()
            raise yt_dlp.utils.DownloadError("Cancelled by user")
        with patch.object(downloads.shutil, "which", return_value="ffmpeg"), patch.object(
            downloads, "extract_with_youtube_fallback", side_effect=extract,
        ):
            downloads._download_sync(job)
        self.assertEqual(job["status"], "cancelled")
        self.assertFalse(os.path.exists(job["tmp_dir"]))


class BulkTests(unittest.TestCase):
    def test_one_worker_crash_does_not_abort_batch(self):
        request = BulkVideoUploadRequest(folder_id=uuid4(), urls=["https://example.com/1", "https://example.com/2"])
        metadata = {"title": "video", "duration_seconds": 1, "platform": "other", "thumbnail": None}
        db = MagicMock()
        db.table.return_value.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[], count=0)
        db.table.return_value.insert.return_value.execute.return_value = SimpleNamespace(data=[{"id": "saved"}])
        def extract(url):
            if url.endswith("/1"):
                raise ValueError("bad URL")
            return metadata
        async def consume(response):
            return [json.loads(line) async for line in response.body_iterator]
        with patch.object(crudvideos, "assert_folder_visible"), patch.object(
            crudvideos, "supabase", db,
        ), patch.object(crudvideos, "record_folder_activity"), patch.object(
            crudvideos, "extract_video_metadata", side_effect=extract,
        ):
            events = asyncio.run(consume(crudvideos.bulk_upload_videos(request, False)))
        self.assertEqual(events[-1], {"type": "complete", "saved": 1, "duplicates": 0, "failed": 1})

    def test_bulk_limit_is_enforced_before_streaming(self):
        request = BulkVideoUploadRequest(folder_id=uuid4(), urls=["https://example.com"] * 3)
        with patch.object(crudvideos, "assert_folder_visible"), patch.object(crudvideos.settings, "MAX_BULK_URLS", 2):
            with self.assertRaises(HTTPException) as error:
                crudvideos.bulk_upload_videos(request, False)
        self.assertEqual(error.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
