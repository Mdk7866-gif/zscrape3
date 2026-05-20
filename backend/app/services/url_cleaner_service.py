import asyncio
import json
import re
from typing import Any

from openai import OpenAI

from app.config import settings


def _normalize_url_local(raw_url: str) -> str:
    url = raw_url.strip().strip('"').strip("'")
    url = re.sub(r"\s+", "", url)
    if url.startswith("www."):
        url = "https://" + url
    return url


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    return json.loads(text)


def _build_prompt(urls: list[str]) -> str:
    return f"""
You are a URL cleaning assistant.

Task:
- Fix obvious URL issues.
- Preserve the same order as input.
- Return ONLY valid JSON.
- Do not add markdown fences.
- Do not explain anything.

Input URLs:
{json.dumps(urls, ensure_ascii=False)}

Return this exact JSON shape:
{{
  "items": [
    {{
      "raw_url": "original input url",
      "cleaned_url": "corrected url or null",
      "valid": true,
      "reason": null
    }}
  ]
}}

Rules:
- If a URL is clearly invalid and cannot be fixed, set valid=false and cleaned_url=null.
- If you only need to add https://, fix spacing, or remove obvious junk, do it.
- Do not hallucinate a URL that does not exist.
""".strip()


async def clean_urls_with_ai(urls: list[str]) -> list[dict[str, Any]]:
    cleaned_inputs = [_normalize_url_local(url) for url in urls if url and url.strip()]
    if not cleaned_inputs:
        return []

    client = OpenAI(api_key=settings.CHATGPT_PAID_API_KEY)

    def _call_model() -> str:
        response = client.responses.create(
            model=settings.OPENAI_MODEL,
            input=_build_prompt(cleaned_inputs),
        )
        return getattr(response, "output_text", "") or ""

    try:
        raw_text = await asyncio.to_thread(_call_model)
        parsed = _extract_json(raw_text)
        items = parsed.get("items", [])
        if not isinstance(items, list):
            raise ValueError("Invalid JSON shape from model")
    except Exception:
        # Fallback: local normalization only
        items = []
        for url in cleaned_inputs:
            is_valid = url.startswith(("http://", "https://"))
            items.append({
                "raw_url": url,
                "cleaned_url": url if is_valid else None,
                "valid": is_valid,
                "reason": None if is_valid else "URL could not be cleaned automatically",
            })

    normalized: list[dict[str, Any]] = []
    for item in items:
        raw_url = str(item.get("raw_url", "")).strip()
        cleaned_url = item.get("cleaned_url")
        cleaned_url = str(cleaned_url).strip() if cleaned_url else None
        valid = bool(item.get("valid", False))
        reason = item.get("reason")
        reason = str(reason).strip() if reason else None
        normalized.append({
            "raw_url": raw_url,
            "cleaned_url": cleaned_url,
            "valid": valid,
            "reason": reason,
        })

    # Keep same order as the cleaned inputs, just in case the model rearranged them.
    order_map = {url: idx for idx, url in enumerate(cleaned_inputs)}
    normalized.sort(key=lambda x: order_map.get(x["raw_url"], 10**9))
    return normalized
