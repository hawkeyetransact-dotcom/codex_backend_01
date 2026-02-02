# Hawkeye LLM Service (Local)

## Setup

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8010
```

## Env

- `OLLAMA_URL` (default: http://localhost:11434)
- `OLLAMA_MODEL` (default: llama3)

## Endpoints

- `GET /v1/health`
- `POST /v1/generate`
- `POST /v1/docx/parse`
