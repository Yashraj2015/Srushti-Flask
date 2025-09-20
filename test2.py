from groq import Groq

client = Groq(
    api_key="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"  
)
completion = client.chat.completions.create(
    model="openai/gpt-oss-20b",
    messages=[
      {
        "role": "user",
        "content": "tell me sbout urself"
      }
    ],
    temperature=1,
    max_completion_tokens=8192,
    top_p=1,
    reasoning_effort="medium",
    stream=True,
    stop=None
)

for chunk in completion:
    print(chunk.choices[0].delta.content or "", end="")

    