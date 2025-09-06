import os
import requests
import json # Import the json library

# Your API key from OpenRouter
API_KEY = "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"

if not API_KEY:
    raise ValueError("❌ OPENROUTER_API_KEY is not set!")

headers = {
    "Authorization": f"Bearer {API_KEY}",
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