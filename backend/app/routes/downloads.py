from fastapi import APIRouter

router = APIRouter(prefix="/download", tags=["download"])

@router.get("/")
def read_root():
    return {"message": "Downloads router placeholder"}
