from uuid import UUID
from typing import List, Dict, Any, Optional
from app.supabase import supabase

class FolderService:
    @staticmethod
    def create_folder(name: str) -> Dict[str, Any]:
        response = supabase.table("folders").insert({"name": name}).execute()
        if not response.data or len(response.data) == 0:
            raise Exception("Failed to create folder")
        return response.data[0]

    @staticmethod
    def fetch_all() -> List[Dict[str, Any]]:
        response = supabase.table("folders").select("*").order("name").execute()
        return response.data or []

    @staticmethod
    def delete_folder(folder_id: UUID) -> bool:
        # Delete entries in videos table referencing folder_id
        supabase.table("videos").delete().eq("folder_id", str(folder_id)).execute()
        # Delete entries in failed_save_urls table referencing folder_id
        supabase.table("failed_save_urls").delete().eq("folder_id", str(folder_id)).execute()
        # Delete the folder itself
        response = supabase.table("folders").delete().eq("id", str(folder_id)).execute()
        return len(response.data or []) > 0

    @staticmethod
    def fetch_by_name(name: str) -> List[Dict[str, Any]]:
        response = supabase.table("folders").select("*").eq("name", name).execute()
        return response.data or []
