import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException

from app.supabase import supabase


def _dt_now() -> datetime:
    return datetime.now(timezone.utc)


async def list_folders() -> list[dict[str, Any]]:
    def _query():
        return supabase.table("folders").select("*").order("created_at", desc=False).execute()
    result = await asyncio.to_thread(_query)
    return result.data or []


async def create_folder(name: str) -> dict[str, Any]:
    clean_name = name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Folder name must not be empty")

    # Check duplicate
    def _exists():
        return (
            supabase.table("folders")
            .select("id")
            .eq("name", clean_name)
            .limit(1)
            .execute()
        )
    existing = await asyncio.to_thread(_exists)
    if existing.data:
        raise HTTPException(status_code=409, detail="Folder already exists")

    def _insert():
        return supabase.table("folders").insert({"name": clean_name}).execute()

    result = await asyncio.to_thread(_insert)
    if not result.data:
        raise HTTPException(status_code=500, detail="Folder was not created")

    return result.data[0]


async def delete_folder(folder_id: UUID) -> bool:
    folder_str = str(folder_id)

    # Remove dependent records first so the operation works even if cascade is not enabled.
    async def _delete_children():
        await asyncio.to_thread(
            lambda: supabase.table("videos").delete().eq("folder_id", folder_str).execute()
        )
        await asyncio.to_thread(
            lambda: supabase.table("failed_save_urls").delete().eq("folder_id", folder_str).execute()
        )

    await _delete_children()

    def _delete_folder():
        return supabase.table("folders").delete().eq("id", folder_str).execute()

    result = await asyncio.to_thread(_delete_folder)
    return bool(result.data)


async def fetch_folder(folder_id: UUID) -> dict[str, Any] | None:
    folder_str = str(folder_id)

    def _query():
        return (
            supabase.table("folders")
            .select("*")
            .eq("id", folder_str)
            .limit(1)
            .execute()
        )
    result = await asyncio.to_thread(_query)
    return result.data[0] if result.data else None


async def list_videos(folder_id: UUID) -> list[dict[str, Any]]:
    folder_str = str(folder_id)

    def _query():
        return (
            supabase.table("videos")
            .select("*")
            .eq("folder_id", folder_str)
            .order("created_at", desc=True)
            .execute()
        )
    result = await asyncio.to_thread(_query)
    return result.data or []


async def fetch_video_by_url(url: str) -> dict[str, Any] | None:
    def _query():
        return (
            supabase.table("videos")
            .select("*")
            .eq("url", url)
            .limit(1)
            .execute()
        )
    result = await asyncio.to_thread(_query)
    return result.data[0] if result.data else None


async def delete_video(video_id: UUID) -> bool:
    video_str = str(video_id)

    def _delete():
        return supabase.table("videos").delete().eq("id", video_str).execute()

    result = await asyncio.to_thread(_delete)
    return bool(result.data)


async def insert_videos(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return []

    def _insert():
        return supabase.table("videos").insert(rows).execute()

    try:
        result = await asyncio.to_thread(_insert)
        return result.data or []
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to insert videos: {exc}")


async def list_failed_urls(folder_id: UUID) -> list[dict[str, Any]]:
    folder_str = str(folder_id)

    def _query():
        return (
            supabase.table("failed_save_urls")
            .select("*")
            .eq("folder_id", folder_str)
            .order("created_at", desc=True)
            .execute()
        )
    result = await asyncio.to_thread(_query)
    return result.data or []


async def delete_failed_url(failed_url_id: UUID) -> bool:
    failed_str = str(failed_url_id)

    def _delete():
        return supabase.table("failed_save_urls").delete().eq("id", failed_str).execute()

    result = await asyncio.to_thread(_delete)
    return bool(result.data)


async def failed_url_exists(folder_id: UUID, url: str) -> bool:
    folder_str = str(folder_id)

    def _query():
        return (
            supabase.table("failed_save_urls")
            .select("id")
            .eq("folder_id", folder_str)
            .eq("url", url)
            .limit(1)
            .execute()
        )
    result = await asyncio.to_thread(_query)
    return bool(result.data)


async def save_failed_url(folder_id: UUID, url: str) -> None:
    clean_url = url.strip()
    if not clean_url:
        return

    if await failed_url_exists(folder_id, clean_url):
        return

    def _insert():
        return supabase.table("failed_save_urls").insert({
            "folder_id": str(folder_id),
            "url": clean_url,
        }).execute()

    await asyncio.to_thread(_insert)


async def save_failed_urls_bulk(folder_id: UUID, urls: list[str]) -> None:
    clean_urls = [u.strip() for u in urls if u and u.strip()]
    unique_urls = list(dict.fromkeys(clean_urls))
    if not unique_urls:
        return

    existing = await list_failed_urls(folder_id)
    existing_set = {row["url"] for row in existing}
    to_insert = [{"folder_id": str(folder_id), "url": url} for url in unique_urls if url not in existing_set]

    if not to_insert:
        return

    def _insert():
        return supabase.table("failed_save_urls").insert(to_insert).execute()

    await asyncio.to_thread(_insert)


async def delete_failed_urls_for_folder_and_urls(folder_id: UUID, urls: list[str]) -> None:
    clean_urls = [u.strip() for u in urls if u and u.strip()]
    unique_urls = list(dict.fromkeys(clean_urls))
    if not unique_urls:
        return

    def _delete():
        return (
            supabase.table("failed_save_urls")
            .delete()
            .eq("folder_id", str(folder_id))
            .in_("url", unique_urls)
            .execute()
        )

    await asyncio.to_thread(_delete)


async def delete_failed_urls_for_folder(folder_id: UUID) -> None:
    def _delete():
        return supabase.table("failed_save_urls").delete().eq("folder_id", str(folder_id)).execute()

    await asyncio.to_thread(_delete)
