from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import io
import os
import re
import requests
import mammoth

app = FastAPI()

PLACEHOLDER_RE = re.compile(r"\[([^\]]+)\]")

class GenerateRequest(BaseModel):
    prompt: str
    model: Optional[str] = None
    max_tokens: Optional[int] = 1200
    temperature: Optional[float] = 0.2

@app.get("/v1/health")
def health():
    return {"status": "ok"}

@app.post("/v1/generate")
def generate(req: GenerateRequest):
    ollama_url = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
    model = req.model or os.environ.get("OLLAMA_MODEL", "llama3")
    payload = {
        "model": model,
        "prompt": req.prompt,
        "stream": False,
        "options": {
            "temperature": req.temperature,
            "num_predict": req.max_tokens
        }
    }
    try:
        resp = requests.post(f"{ollama_url}/api/generate", json=payload, timeout=90)
        resp.raise_for_status()
        data = resp.json() or {}
        return {"text": (data.get("response") or "").strip(), "model": model}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))

@app.post("/v1/docx/parse")
async def parse_docx(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")
    if not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are supported")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        with io.BytesIO(data) as docx_stream:
            result = mammoth.convert_to_html(docx_stream)
            html = result.value or ""
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to parse docx: {exc}")

    try:
        with io.BytesIO(data) as docx_stream:
            raw_text = mammoth.extract_raw_text(docx_stream).value or ""
    except Exception:
        raw_text = ""

    fields: List[dict] = []

    def replace_placeholder(match: re.Match):
        label = (match.group(1) or "").strip()
        if not label:
            return match.group(0)
        name = re.sub(r"[^a-zA-Z0-9_]+", "_", label).strip("_").lower()
        fields.append({"label": label, "name": name})
        return (
            f"<span class='inline-field' data-field='{name}'>"
            f"<input type='text' name='{name}' placeholder='{label}' class='inline-input' />"
            f"</span>"
        )

    html_with_inputs = PLACEHOLDER_RE.sub(replace_placeholder, html)

    return {
        "html": html_with_inputs,
        "text": raw_text,
        "fields": fields,
        "filename": file.filename
    }
