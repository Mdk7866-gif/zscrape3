from fastapi import APIRouter, HTTPException, status
from uuid import UUID
from typing import List
from app.schemas.folder import FolderCreate, FolderOut, FolderDeleteResponse
from app.supabase import supabase
from app.admin_auth import AdminFlag, assert_folder_visible
from app.thumbnail_store import delete_folder_thumbnails
from app.folder_activity import FOLDER_CREATED
from postgrest.exceptions import APIError

router = APIRouter(
    prefix="/folder",
    tags=["/foldercreate means create new folder entry in folder table of database, /folderdelete means delete the folder from that table also delete all the entries in videos and failed_save_urls table which have  folder_id as foreign key, /folderfetch  means fetch all the folders name from folder table which has this folder name "]
)


@router.post("/create", response_model=FolderOut, status_code=status.HTTP_201_CREATED)
def create_folder(folder: FolderCreate, admin: AdminFlag):
    # An admin session creates folders inside the private workspace; everyone
    # else creates public ones. The client never gets to choose this.
    try:
        response = supabase.table("folders").insert({
            "name": folder.name,
            "is_admin": admin,
            "last_activity": FOLDER_CREATED,
        }).execute()
        return response.data[0]
    except APIError as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Folder with name '{folder.name}' already exists."
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.delete("/delete/{folder_id}", response_model=FolderDeleteResponse)
def delete_folder(folder_id: UUID, admin: AdminFlag):
    # 404s for a non-admin targeting an admin folder, so folder IDs can't be
    # probed for existence.
    assert_folder_visible(folder_id, admin)
    try:
        # Cached Instagram/Facebook thumbnails live outside Postgres, so nothing
        # cascades them — drop them explicitly or they'd linger in storage
        # forever. Keyed by the `{folder_id}/` path prefix, so this works even
        # though the video rows are about to disappear.
        delete_folder_thumbnails(str(folder_id))

        # Delete related records first to avoid foreign key constraints
        supabase.table("failed_save_urls").delete().eq("folder_id", str(folder_id)).execute()
        supabase.table("videos").delete().eq("folder_id", str(folder_id)).execute()

        response = supabase.table("folders").delete().eq("id", str(folder_id)).execute()
        deleted = len(response.data) > 0
        return FolderDeleteResponse(
            success=True,
            deleted=deleted,
            folder_id=folder_id
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/fetchall", response_model=List[FolderOut])
def fetch_all_folders(admin: AdminFlag):
    """Admin sessions see only the private workspace; everyone else sees only public folders."""
    try:
        response = (
            supabase.table("folders")
            .select("*")
            .eq("is_admin", admin)
            .order("created_at", desc=True)
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/fetch", response_model=List[FolderOut])
def fetch_folder_by_name(name: str, admin: AdminFlag):
    try:
        response = (
            supabase.table("folders")
            .select("*")
            .eq("is_admin", admin)
            .ilike("name", f"%{name}%")
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
