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
    tags=["chat — simple langgraph chat with gpt-4o"]
)

# ── State Definition ──────────────────────────────────────────────────────────

class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], lambda x, y: x + y]

# ── Node Definitions ─────────────────────────────────────────────────────────-

SYSTEM_PROMPT = (
    "You are an expert URL extractor. Your task is to extract ALL valid URLs from the user's message. "
    "Do NOT miss any URL. Remove any duplicate URLs. "
    "Make sure the URLs are clean and do not include extra text, brackets, tracking parameters (if safe to remove), or markdown. "
    "Return a structured list of these clean URLs."
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
        model="gpt-4o",
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
    LangGraph endpoint that extracts URLs from the user query using GPT-4o.
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
    try:
        data = json.loads(raw_content)
        extracted_urls = data.get("urls", [])
    except json.JSONDecodeError:
        extracted_urls = []
        
    # Remove any potential duplicates and ensure they look like URLs
    clean_urls = list(dict.fromkeys([u.strip() for u in extracted_urls if u.strip().startswith("http")]))
    
    return ChatResponse(urls=clean_urls)
