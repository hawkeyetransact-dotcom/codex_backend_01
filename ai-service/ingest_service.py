import pandas as pd
from docx import Document
from pypdf import PdfReader
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from langchain.output_parsers import ResponseSchema, StructuredOutputParser
import io

# Initialize LLM
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

# Define Output Schema
question_schema = ResponseSchema(name="questions", description="A list of extracted questions. Each item should have 'category', 'question', 'risk_level' (Low/Medium/High), and 'type' (YesNo/Text).")
output_parser = StructuredOutputParser.from_response_schemas([question_schema])
format_instructions = output_parser.get_format_instructions()

prompt_template = ChatPromptTemplate.from_template("""
You are an expert Audit Template Extractor.
Extract valid audit questions from the provided text.
Ignore legal disclaimers, confusing headers, or intro text.
Guess the Category if not explicitly stated. Default Risk Level to "Medium".

Text: {text}

{format_instructions}
""")

async def parse_and_extract(file_content: bytes, filename: str):
    text = ""
    
    # 1. Extract Raw Text based on extension
    if filename.endswith(".xlsx"):
        df = pd.read_excel(io.BytesIO(file_content))
        text = df.to_string()
    elif filename.endswith(".docx"):
        doc = Document(io.BytesIO(file_content))
        text = "\n".join([para.text for para in doc.paragraphs])
    elif filename.endswith(".pdf"):
        reader = PdfReader(io.BytesIO(file_content))
        text = "\n".join([page.extract_text() for page in reader.pages])
    else:
        raise ValueError("Unsupported file type")

    # 2. Extract Structure via LLM
    # Chunking might be needed for huge files, but for standard templates (5-10 pages), 128k context is enough.
    messages = prompt_template.format_messages(text=text[:50000], format_instructions=format_instructions) # Limit to 50k chars just in case
    response = llm.invoke(messages)
    
    try:
        parsed_output = output_parser.parse(response.content)
        return parsed_output.get("questions", [])
    except Exception as e:
        print(f"Parsing error: {e}")
        return []
