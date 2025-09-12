import os
import requests
import json # Import the json library
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# openrouter_client = OpenAI(
#   base_url="https://openrouter.ai/api/v1",
#   api_key=os.getenv("OPENROUTER_API_KEY"),
# )

# Your API key from OpenRouter
API_KEY = "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"

if not API_KEY:
    raise ValueError("❌ OPENROUTER_API_KEY is not set!")

headers = {
    "Authorization": f"Bearer {os.getenv('OPENROUTER_API_KEY')}",
    "Content-Type": "application/json",
}

# The message you want to send to the AI
user_prompt = "hi"

payload = {
    "model": "qwen/qwen3-235b-a22b:free",
    "messages": [{"role": "user", "content": user_prompt}],
}

try:
    print("Sending request to AI...")
    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers=headers,
        json=payload
    )

    # Check if the request was successful (HTTP status code 200)
    if response.status_code == 200:
        # Parse the JSON response into a Python dictionary
        data = response.json()
        
        # Convert the Python dictionary back into a formatted JSON string
        # The `indent=4` argument adds indentation for readability
        structured_json_output = json.dumps(data, indent=4)
        
        # Print the entire structured JSON response
        print("\n" + "="*50)
        print("✅ Full Structured JSON Response:")
        print("="*50)
        print(structured_json_output)
        print("="*50 + "\n")

    else:
        # If the request failed, print the error status and details
        print(f"\n❌ Error: Received status code {response.status_code}")
        print("Response:", response.text)

except requests.exceptions.RequestException as e:
    print(f"An error occurred with the network request: {e}")