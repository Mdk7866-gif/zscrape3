# import cloudinary
# import cloudinary.uploader
# import asyncio
# from app.config import get_settings

# settings = get_settings()

# # Configure Cloudinary
# cloudinary.config(
#     cloud_name=settings.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
#     api_key=settings.CLOUDINARY_API_KEY,
#     api_secret=settings.CLOUDINARY_API_SECRET
# )

# async def upload_image_to_cloudinary(file_content, filename: str, folder: str = "farmhelp") -> str:
#     """
#     Uploads a file-like object to Cloudinary and returns the secure URL.
#     Wraps the synchronous Cloudinary call in run_in_executor to avoid blocking the event loop.
#     """
#     try:
#         loop = asyncio.get_event_loop()
#         # cloudinary.uploader.upload is blocking, so run it in a thread
#         result = await loop.run_in_executor(
#             None, 
#             lambda: cloudinary.uploader.upload(file_content, folder=folder, resource_type="image")
#         )
#         return result.get("secure_url")
#     except Exception as e:
#         print(f"Error uploading to Cloudinary: {e}")
#         return None
