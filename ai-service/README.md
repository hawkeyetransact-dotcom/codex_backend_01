# Hawkeye AI Service

## Setup
1. Open a terminal in this directory:
   ```bash
   cd "C:\Users\debab\Code - Hawkeye\Nov 2025 - Copy\hawkeye-redesign-backend\hawkeye-backend-dev (2)\hawkeye-backend-dev\ai-service"
   ```
2. Create/Activate virtual environment:
   ```bash
   python -m venv venv
   .\venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. **Important**: Set your `OPENAI_API_KEY` environment variable, or pass it in the request.
   ```bash
   set OPENAI_API_KEY=sk-...
   ```

## Running the Service
Start the server using Uvicorn:
```bash
uvicorn main:app --reload
```
The service will start at `http://127.0.0.1:8000`.

## Testing
### Option 1: Swagger UI
Open [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) and test `/analyze-batch`.

### Option 2: Test Script
Run the batch test script:
```bash
python test_batch.py
```
