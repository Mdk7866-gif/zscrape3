from supabase import Client, create_client

from app.config import settings

# Use the service role / secret key on the backend only.
supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SECRET_KEY,
)
