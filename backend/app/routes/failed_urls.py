from fastapi import APIRouter

router = APIRouter(prefix="/failed-urls", tags=["failed-urls"])

@router.get("/")
def read_root():
    return {"message": "Failed URLs router placeholder"}
