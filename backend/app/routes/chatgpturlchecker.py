from fastapi import APIRouter

router = APIRouter(prefix="/chatgpt", tags=["chatgpt"])

@router.get("/")
def read_root():
    return {"message": "ChatGPT router placeholder"}
