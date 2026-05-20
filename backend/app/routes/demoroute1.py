from fastapi import APIRouter

router = APIRouter(
    prefix="/actual-crop-prediction",
    tags=["Actual Crop Prediction"]
)

@router.get("/")
async def get_crop_prediction():
    return {"message": "ye post request accept karega  with fields as temp, relative humidity, pressure,wind speed, net radiation ,,,, then it will return the top three most likely crop name and with percentage likely using ML"}
