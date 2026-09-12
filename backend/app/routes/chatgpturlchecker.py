from typing import Annotated, TypedDict, List
from fastapi import APIRouter, Depends
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, END
from app.config import get_settings, Settings
from app.schemas.url_checker import ChatRequest, ChatResponse

router = APIRouter(
    prefix="/chatgpturlchecker",
    tags=["chat — simple langgraph chat with GPT-5.6 Luna"]
)

# ── State Definition ──────────────────────────────────────────────────────────

class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], lambda x, y: x + y]

# ── Node Definitions ─────────────────────────────────────────────────────────-

SYSTEM_PROMPT = (
    "You are an expert URL extractor. Your task is to extract ALL URLs from the user's input, including both valid and invalid/broken URLs. "
    "Do NOT ignore, filter out, or eliminate any URL, even if it has typos, is invalid, is from an unknown platform, or is formatted incorrectly. "
    "If the input contains URLs that are stuck together (e.g., without spaces), separated by commas, or embedded in comments/text, you must extract each individual URL. "
    "WhatsApp-style exports may prefix a URL with a timestamp and sender name (for example, '[3:05 am, 12/09/2026] Zaid:'); extract only the URL. "
    "Preserve complete Reddit share links, including their '/r/<subreddit>/s/<share-id>' path. "
    "Clean each URL by removing surrounding quotes, brackets, parentheses, trailing punctuation (like commas or periods), tracking parameters (such as si, igsh, fbclid, etc., if safe to remove), or markdown syntax. "
    "Do NOT remove or filter out any URL under any circumstances. "
    "Return a structured list of these URLs."
)

def call_model(state: AgentState, config: RunnableConfig = None):
    # Retrieve settings from the config we passed in the API endpoint
    settings: Settings = config.get("configurable", {}).get("settings") if config else None
    
    if not settings:
        settings = get_settings()

    from pydantic import BaseModel
    
    class ChatResponseSchema(BaseModel):
        urls: List[str]

    llm = ChatOpenAI(
        model="gpt-5.6-luna",
        api_key=settings.CHATGPT_PAID_API_KEY,
        temperature=0
    ).with_structured_output(ChatResponseSchema)
    
    # Add system message to the start of the message list
    from langchain_core.messages import SystemMessage
    messages = [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]

    # This returns a ChatResponseSchema Pydantic object
    structured_response = llm.invoke(messages)
    
    # Convert it to an AIMessage with JSON content so it fits in the state
    return {"messages": [AIMessage(content=structured_response.model_dump_json())]}

# ── Graph Construction ────────────────────────────────────────────────────────

workflow = StateGraph(AgentState)
workflow.add_node("agent", call_model)
workflow.set_entry_point("agent")
workflow.add_edge("agent", END)

app_graph = workflow.compile()

# ── API Endpoint ──────────────────────────────────────────────────────────────

@router.post("/", response_model=ChatResponse)
async def chat_query(
    body: ChatRequest,
    settings: Settings = Depends(get_settings)
):
    """
    LangGraph endpoint that extracts URLs from the user query using GPT-5.6 Luna.
    """
    initial_state = {
        "messages": [HumanMessage(content=body.query)]
    }
    
    config = {"configurable": {"settings": settings}}
    result = await app_graph.ainvoke(initial_state, config=config)
    
    last_message = result["messages"][-1]
    raw_content = last_message.content if last_message.content else "{}"
    
    # Parse the JSON string back into a list and remove duplicates
    import json
    import urllib.parse
    from collections import defaultdict
    try:
        data = json.loads(raw_content)
        extracted_urls = data.get("urls", [])
    except json.JSONDecodeError:
        extracted_urls = []
        
    # Clean the extracted URLs (keeping non-empty strings)
    cleaned = [u.strip() for u in extracted_urls if u.strip()]
    
    # Deduplicate while preserving insertion order
    unique_urls = list(dict.fromkeys(cleaned))
    
    # Group URLs by platform for round-robin interleaving
    def get_platform_key(url: str) -> str:
        url_lower = url.lower()
        if "twitter.com" in url_lower or "x.com" in url_lower:
            return "twitter"
        if "instagram.com" in url_lower:
            return "instagram"
        if "reddit.com" in url_lower or "redd.it" in url_lower:
            return "reddit"
        if "youtube.com" in url_lower or "youtu.be" in url_lower:
            return "youtube"
        if "tiktok.com" in url_lower:
            return "tiktok"
        if "facebook.com" in url_lower or "fb.watch" in url_lower:
            return "facebook"
        try:
            parsed = urllib.parse.urlparse(url)
            if parsed.netloc:
                return parsed.netloc.lower()
        except Exception:
            pass
        return "other"

    groups = defaultdict(list)
    for url in unique_urls:
        platform = get_platform_key(url)
        groups[platform].append(url)
        
    # Interleave URLs using round-robin by platform
    platforms = list(groups.keys())
    interleaved_urls = []
    max_len = max((len(lst) for lst in groups.values()), default=0)
    for i in range(max_len):
        for p in platforms:
            if i < len(groups[p]):
                interleaved_urls.append(groups[p][i])
                
    return ChatResponse(urls=interleaved_urls)
