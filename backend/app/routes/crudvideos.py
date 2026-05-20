from fastapi import APIRouter

router = APIRouter(prefix="/video", tags=["video"])

@router.get("/")
def read_root():
    return {"message": "Videos router placeholder"}
