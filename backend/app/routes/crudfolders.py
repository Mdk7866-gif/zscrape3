from fastapi import APIRouter, HTTPException, status
from uuid import UUID
from typing import List
from app.schemas.folder import FolderCreate, FolderOut, FolderDeleteResponse
from app.services.supabase_service_folders import FolderService
from postgrest.exceptions import APIError

router = APIRouter(
    prefix="/folder",
    tags=["/foldercreate means create new folder entry in folder table of database, /folderdelete means delete the folder from that table also delete all the entries in videos and failed_save_urls table which have  folder_id as foreign key, /folderfetch  means fetch all the folders name from folder table which has this folder name "]
)

@router.post("/create", response_model=FolderOut, status_code=status.HTTP_201_CREATED)
def create_folder(folder: FolderCreate):
    try:
        new_folder = FolderService.create_folder(folder.name)
        return new_folder
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
        deleted = FolderService.delete_folder(folder_id)
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
        return FolderService.fetch_all()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/fetch", response_model=List[FolderOut])
def fetch_folder_by_name(name: str):
    try:
        return FolderService.fetch_by_name(name)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
