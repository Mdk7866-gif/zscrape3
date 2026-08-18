import httpx
from supabase import Client, ClientOptions, create_client

from app.config import settings

# httpx's HTTP/2 sync backend intermittently raises
# `httpcore.ReadError: [WinError 10035] A non-blocking socket operation could
# not be completed immediately` on Windows when it reuses a pooled connection
# that's gone slightly stale — surfaces as a random 500 from any route that
# calls Supabase (e.g. assert_folder_visible), which then succeeds on retry
# because retrying opens a fresh connection. Supabase's REST API works fine
# over plain HTTP/1.1, and this backend has no concurrency needs that would
# benefit from HTTP/2, so disabling it here removes the flakiness at the
# source instead of papering over it with retries.
_http_client = httpx.Client(http2=False)

# Use the service role / secret key on the backend only.
supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SECRET_KEY,
    options=ClientOptions(httpx_client=_http_client),
)
