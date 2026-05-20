from fastapi import APIRouter

router = APIRouter(prefix="/chatgpturlchecker", tags=["chatgpturlchecker"])

@router.get("/")
def read_root():
    return {"message": "ChatGPT router placeholder"}
