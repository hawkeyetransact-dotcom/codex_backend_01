import requests
import json

def test_analyze():
    url = "http://127.0.0.1:8000/analyze"
    
    payload = {
        "question_text": "does the supplier have ISO 27001 certificate?",
        "question_category": "Compliance",
        "supplier_id": "sup_12345",
        "options": ["Yes", "No", "N/A"]
    }
    
    print(f"Sending request to {url}...")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        
        result = response.json()
        print("\n✅ Success! Response:")
        print(json.dumps(result, indent=2))
        
    except requests.exceptions.ConnectionError:
        print("\n❌ Error: Could not connect to the service. Make sure it is running on port 8000.")
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    test_analyze()
