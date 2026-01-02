from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from typing import List, Optional, Dict
import os
import httpx
import tempfile
from langchain_community.document_loaders import PyPDFLoader
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate
from langchain.text_splitter import RecursiveCharacterTextSplitter

app = FastAPI(title="Hawkeye AI Service", description="Microservice for Document Intelligence and RAG")

# Temporary in-memory storage for simplicity (MVP)
# In production, use a proper Vector DB or caching layer

class QuestionItem(BaseModel):
    id: str
    text: str
    category: Optional[str] = None

class BatchAnalysisRequest(BaseModel):
    questions: List[QuestionItem]
    doc_urls: List[str]
    api_key: Optional[str] = None # Optional: Pass key if not in env

@app.get("/")
def read_root():
    return {"status": "online", "service": "Hawkeye AI Brain"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

from ingest_service import parse_and_extract

# ... (existing imports)

@app.post("/ingest-template")
async def ingest_template(file: UploadFile = File(...)):
    try:
        content = await file.read()
        questions = await parse_and_extract(content, file.filename)
        return {"questions": questions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-batch")
# ... (existing code)
async def analyze_batch(request: BatchAnalysisRequest):
    """
    Downloads documents, creates a vector store, and answers all questions.
    """
    openai_api_key = request.api_key or os.environ.get("OPENAI_API_KEY")
    if not openai_api_key:
        raise HTTPException(status_code=400, detail="OpenAI API Key provided in request or environment")
    
    # 1. Download and Process Documents
    documents = []
    
    # Create a temporary directory to store downloaded PDFs
    with tempfile.TemporaryDirectory() as temp_dir:
        for i, url in enumerate(request.doc_urls):
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(url, timeout=30.0)
                    resp.raise_for_status()
                    
                    # Determine extension (default to pdf)
                    ext = ".pdf"
                    if url.endswith(".txt"): ext = ".txt"
                    elif url.endswith(".png") or url.endswith(".jpg"): continue # Skip images for now (needs OCR)
                    
                    file_path = os.path.join(temp_dir, f"doc_{i}{ext}")
                    with open(file_path, "wb") as f:
                        f.write(resp.content)
                    
                    # Load
                    if ext == ".pdf":
                        loader = PyPDFLoader(file_path)
                        docs = loader.load()
                        # Add metadata
                        for doc in docs:
                            doc.metadata["source_url"] = url
                        documents.extend(docs)
                    
            except Exception as e:
                print(f"Failed to process {url}: {e}")
                # Continue with other docs
                continue
    
    if not documents:
        return {"suggestions": {}, "attachments": [], "error": "No valid text content extracted from documents."}

    # 2. Split Text
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    texts = text_splitter.split_documents(documents)
    
    # 3. Create Vector Store
    embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)
    db = FAISS.from_documents(texts, embeddings)
    
    # 4. Initialize LLM
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.1, openai_api_key=openai_api_key)
    
    # 5. Answer Questions
    results = {}
    
    # Custom Prompt
    prompt_template = """Use the following pieces of context to answer the question at the end. 
    If you don't know the answer, just say "N/A" or leave it blank, don't try to make up an answer.
    Output your answer in a specific format.
    
    Context: {context}
    
    Question: {question}
    
    Format:
    Answer: <Yes/No/NA> (Choose one if it's a Yes/No question, otherwise keep brief)
    Evidence: <Quote specific text from the document supporting your answer>
    """
    PROMPT = PromptTemplate(
        template=prompt_template, input_variables=["context", "question"]
    )
    
    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=db.as_retriever(search_kwargs={"k": 4}),
        chain_type_kwargs={"prompt": PROMPT}
    )
    
    for q in request.questions:
        query = f"Question [{q.category}]: {q.text}"
        try:
            # Run chain
            raw_res = qa_chain.run(query)
            
            # Simple parsing of the custom format
            answer_line = "NA"
            evidence_line = ""
            
            lines = raw_res.split('\n')
            for line in lines:
                if line.startswith("Answer:"):
                    answer_line = line.replace("Answer:", "").strip()
                elif line.startswith("Evidence:"):
                    evidence_line = line.replace("Evidence:", "").strip()
            
            # If parsing failed, just take the raw output as evidence
            if answer_line == "NA" and len(raw_res) > 20 and "Evidence:" not in raw_res:
                 evidence_line = raw_res
            
            results[q.id] = {
                "answer": answer_line,
                "response": evidence_line
            }
        except Exception as e:
            print(f"Error answering {q.id}: {e}")
            results[q.id] = {"answer": "", "response": ""}
            
    # Attachments summary (simplified)
    attachments_info = [{"url": u, "summary": "Processed via RAG"} for u in request.doc_urls]
            
    return {"suggestions": results, "attachments": attachments_info}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
