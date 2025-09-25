import requests
import json
from dotenv import load_dotenv
import os

load_dotenv()

url = "https://openrouter.ai/api/v1/chat/completions"
headers = {
    "Authorization": f"Bearer {os.getenv('OPENROUTER_API_KEY')}",
    "Content-Type": "application/json"
}
payload = {
    "model": "deepseek/deepseek-chat-v3.1:free",
    "messages": [
        {"role": "user", "content": "hi"}
    ],
    "reasoning": {
        "effort": "medium"  # Use high reasoning effort
    }
}

response = requests.post(url, headers=headers, data=json.dumps(payload))
print(response.json()['choices'][0]['message']['reasoning'])
print(response.json()['choices'][0]['message']['content'])
