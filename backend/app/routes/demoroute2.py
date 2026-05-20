from fastapi import APIRouter

router = APIRouter(
    prefix="/hello",
    tags=["Actual Crop Prediction"]
)

@router.get("/")
async def get_crop_prediction():
    return {"message": "kaisa hai tu meri jaan"}
