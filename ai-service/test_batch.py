import requests
import json
import os

def test_batch():
    url = "http://127.0.0.1:8000/analyze-batch"
    
    # Example public PDF or use a local one if you handle file uploads differently.
    # Here we use a sample PDF URL for testing.
    sample_pdf = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
    
    payload = {
        "questions": [
            {"id": "q1", "text": "What is the title of the document?", "category": "General"},
            {"id": "q2", "text": "Is this a real audit report?", "category": "Compliance"}
        ],
        "doc_urls": [sample_pdf],
        # "api_key": "sk-..." # Uncomment and add key if not in env
    }
    
    print(f"Sending batch request to {url}...")
    try:
        response = requests.post(url, json=payload, timeout=60)
        
        if response.status_code == 200:
            print("\n✅ Success! Response:")
            print(json.dumps(response.json(), indent=2))
        else:
            print(f"\n❌ Failed: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    test_batch()
