from __future__ import annotations

import json
import os
import urllib.request
from typing import Any


def _post_json(url: str, headers: dict[str, str], body: dict[str, Any], timeout: int = 45) -> dict[str, Any]:
    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url=url, data=payload, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
    try:
        return json.loads(raw)
    except Exception:
        return {"raw": raw}


def call_groq_or_openrouter(model: str, prompt: str, context: Any = None) -> dict[str, Any]:
    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    messages = [{"role": "user", "content": str(prompt)}]
    if context:
        messages.insert(0, {"role": "system", "content": f"Context:\n{json.dumps(context, ensure_ascii=False)}"})
    if groq_key:
        payload = _post_json(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {groq_key}",
            },
            {
                "model": model,
                "messages": messages,
                "temperature": 0.2,
            },
        )
        text = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
        return {"provider": "groq", "model": model, "text": str(text)}
    if openrouter_key:
        payload = _post_json(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {openrouter_key}",
            },
            {
                "model": model,
                "messages": messages,
                "temperature": 0.2,
            },
        )
        text = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
        return {"provider": "openrouter", "model": model, "text": str(text)}
    raise RuntimeError("Neither GROQ_API_KEY nor OPENROUTER_API_KEY is configured.")


def call_google_ai_studio(model: str, prompt: str, context: Any = None) -> dict[str, Any]:
    api_key = os.environ.get("GOOGLE_AI_STUDIO_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GOOGLE_AI_STUDIO_API_KEY is not configured.")
    parts = []
    if context:
        parts.append({"text": f"Context:\n{json.dumps(context, ensure_ascii=False)}"})
    parts.append({"text": str(prompt)})
    payload = _post_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
        {
            "Content-Type": "application/json",
        },
        {
            "contents": [{"parts": parts}],
            "generationConfig": {"temperature": 0.2},
        },
    )
    text = (
        payload.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
    )
    return {"provider": "google-ai-studio", "model": model, "text": str(text)}


def call_openrouter_or_openai(model: str, prompt: str, context: Any = None) -> dict[str, Any]:
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    messages = [{"role": "user", "content": str(prompt)}]
    if context:
        messages.insert(0, {"role": "system", "content": f"Context:\n{json.dumps(context, ensure_ascii=False)}"})
    if openai_key:
        payload = _post_json(
            "https://api.openai.com/v1/chat/completions",
            {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {openai_key}",
            },
            {
                "model": "gpt-4o",
                "messages": messages,
                "temperature": 0.1,
            },
        )
        text = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
        return {"provider": "openai", "model": "gpt-4o", "text": str(text)}
    if openrouter_key:
        payload = _post_json(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {openrouter_key}",
            },
            {
                "model": model,
                "messages": messages,
                "temperature": 0.1,
            },
        )
        text = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
        return {"provider": "openrouter", "model": model, "text": str(text)}
    raise RuntimeError("Neither OPENAI_API_KEY nor OPENROUTER_API_KEY is configured.")


async def route_llm_request(intent: str, prompt: str, context: Any = None) -> dict[str, Any]:
    normalized_intent = str(intent or "").strip().lower()
    if normalized_intent in {"voice_chat", "quick_command"}:
        return call_groq_or_openrouter(
            model="qwen-2.5-32b-instruct",
            prompt=prompt,
            context=context,
        )
    if normalized_intent in {"analyze_codebase", "rag_search"}:
        return call_google_ai_studio(
            model="gemini-2.0-flash",
            prompt=prompt,
            context=context,
        )
    if normalized_intent in {"system_modification", "write_code", "execute_workflow"}:
        return call_openrouter_or_openai(
            model="openai/gpt-4o",
            prompt=prompt,
            context=context,
        )
    return call_groq_or_openrouter(
        model="qwen-2.5-32b-instruct",
        prompt=prompt,
        context=context,
    )
