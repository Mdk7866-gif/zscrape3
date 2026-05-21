from fastapi import APIRouter, HTTPException, status
from uuid import UUID
from typing import List
from app.schemas.folder import FolderCreate, FolderOut, FolderDeleteResponse
from app.supabase import supabase
from postgrest.exceptions import APIError

router = APIRouter(
    prefix="/folder",
    tags=["/foldercreate means create new folder entry in folder table of database, /folderdelete means delete the folder from that table also delete all the entries in videos and failed_save_urls table which have  folder_id as foreign key, /folderfetch  means fetch all the folders name from folder table which has this folder name "]
)

@router.post("/create", response_model=FolderOut, status_code=status.HTTP_201_CREATED)
def create_folder(folder: FolderCreate):
    try:
        response = supabase.table("folders").insert({"name": folder.name}).execute()
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
def delete_folder(folder_id: UUID):
    try:
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
def fetch_all_folders():
    try:
        response = supabase.table("folders").select("*").order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/fetch", response_model=List[FolderOut])
def fetch_folder_by_name(name: str):
    try:
        response = supabase.table("folders").select("*").ilike("name", f"%{name}%").execute()
        return response.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
