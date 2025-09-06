import os
import json
import requests
import traceback
from dotenv import load_dotenv
from flask import Flask, render_template, redirect, url_for, session, request, jsonify, Response, flash
from authlib.integrations.flask_client import OAuth
from supabase import create_client, Client
from functools import wraps
from datetime import timedelta, datetime
import base64
import io
from PIL import Image
from werkzeug.utils import secure_filename
import mimetypes
from openai import OpenAI
from groq import Groq # <-- ADDED: Import Groq

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY")
app.permanent_session_lifetime = timedelta(days=30)

# Add this configuration after your app initialization:
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'}

openrouter_client = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key=os.getenv("OPENROUTER_API_KEY"),
)

# --- ADDED: Groq Client Initialization ---
groq_client = Groq(
    api_key=os.getenv("GROQ_API_KEY"),
)
# ----------------------------------------

# --- Supabase & OAuth Initialization ---
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)
oauth = OAuth(app)
google = oauth.register(
    name='google',
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)

# --- Decorators & Auth Routes ---
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def get_greeting(user_session):
    """Generates a time-based greeting for the user."""
    first_name = user_session.get('name', 'User').split(' ')[0]
    if not first_name:
        first_name = "User"
        
    current_hour = datetime.now().hour
    
    if 5 <= current_hour < 12:
        greeting_time = "Good morning"
    elif 12 <= current_hour < 17:
        greeting_time = "Good afternoon"
    else:
        greeting_time = "Good evening"
        
    return f"{greeting_time}, {first_name}"


@app.route('/login')
def login():
    if 'user' in session:
        return redirect(url_for('index'))
    return render_template('login.html')


@app.route('/auth/google')
def auth_google():
    redirect_uri = url_for('auth_google_callback', _external=True)
    return google.authorize_redirect(redirect_uri)

@app.route('/auth/google/callback')
def auth_google_callback():
    try:
        token = google.authorize_access_token()
        user_info = token.get('userinfo')
        if not user_info:
            raise Exception("User info not found in token.")
        user_id, email, full_name, avatar_url = user_info['sub'], user_info['email'], user_info.get('name', ''), user_info.get('picture', '')
        if not supabase.table('users').select('id').eq('id', user_id).execute().data:
            supabase.table('users').insert({
                'id': user_id, 'email': email, 'full_name': full_name, 'avatar_url': avatar_url
            }).execute()
        session.permanent = True
        session['user'] = {
            'id': user_id, 'email': email, 'name': full_name, 'picture': avatar_url
        }
        return redirect(url_for('index'))
    except Exception as e:
        flash(f"Error during Google login: {e}", "error")
        return redirect(url_for('login'))

@app.route('/logout')
def logout():
    session.pop('user', None)
    flash("You have been logged out.", "info")
    return redirect(url_for('login'))

# --- Main App Routes ---
@app.route('/')
@login_required
def index():
    user_id = session['user']['id']
    greeting = get_greeting(session['user'])
    # ✅ FIX: Add explicit limit and ordering to get all conversations
    try:
        # Try using RPC first
        conversations = supabase.rpc('get_conversations_with_messages', {
            'p_user_id': user_id
        }).execute()
        
        # If RPC doesn't return enough results or fails, fallback to direct query
        if not conversations.data or len(conversations.data) < 50:  # Arbitrary check
            print("Using fallback query for conversations")
            conversations_fallback = supabase.table('conversations')\
                .select('*')\
                .eq('user_id', user_id)\
                .order('updated_at', desc=True)\
                .limit(100)\
                .execute()  # Get up to 100 conversations
            
            if conversations_fallback.data:
                conversations = conversations_fallback
                
    except Exception as e:
        print(f"Error fetching conversations: {e}")
        # Ultimate fallback - direct table query
        conversations = supabase.table('conversations')\
            .select('*')\
            .eq('user_id', user_id)\
            .order('updated_at', desc=True)\
            .limit(100)\
            .execute()
    
    return render_template('index.html', user=session['user'], conversations=conversations.data, greeting=greeting)

@app.route('/conversation/<conversation_id>')
@login_required
def load_conversation(conversation_id):
    user_id = session['user']['id']
    greeting = get_greeting(session['user'])
    
    try:
        # Try RPC first
        conversations_res = supabase.rpc('get_conversations_with_messages', {
            'p_user_id': user_id
        }).execute()
        
        # Fallback if needed
        if not conversations_res.data or len(conversations_res.data) < 50:
            print("Using fallback query for conversations in load_conversation")
            conversations_res = supabase.table('conversations')\
                .select('*')\
                .eq('user_id', user_id)\
                .order('updated_at', desc=True)\
                .limit(100)\
                .execute()
                
    except Exception as e:
        print(f"Error fetching conversations: {e}")
        conversations_res = supabase.table('conversations')\
            .select('*')\
            .eq('user_id', user_id)\
            .order('updated_at', desc=True)\
            .limit(100)\
            .execute()
    
    # Get messages for the specific conversation
    messages_res = supabase.table('messages')\
        .select('*')\
        .eq('conversation_id', conversation_id)\
        .order('created_at', desc=False)\
        .execute()
    
    return render_template(
        'index.html', 
        user=session['user'], 
        conversations=conversations_res.data,
        active_conversation_id=conversation_id, 
        messages=messages_res.data,
        greeting=greeting
    )

# --- Function Calling Logic ---
web_search_tool = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": "Search the web for recent and relevant information on a given topic.",
        "parameters": {
            "type": "object",
            "properties": { "query": {"type": "string", "description": "The search query to use."} },
            "required": ["query"]
        }
    }
}

def perform_web_search(query: str):
    print(f"--- Performing web search for: '{query}' ---")
    langsearch_api_key = os.getenv("LANGSEARCH_API_KEY")
    if not langsearch_api_key:
        return [], "Web search is not configured."
    try:
        one_week_ago = datetime.now() - timedelta(days=7)
        date_string = one_week_ago.strftime('%Y-%m-%d')
        enhanced_query = f"{query} after:{date_string}"
        print(f"--- Enhanced search query: '{enhanced_query}' ---")
        search_payload = {"query": enhanced_query, "freshness": "Past week"}
        search_response = requests.post(
            "https://api.langsearch.com/v1/web-search",
            headers={"Authorization": f"Bearer {langsearch_api_key}", "Content-Type": "application/json"},
            json=search_payload, timeout=15
        )
        search_response.raise_for_status()
        search_results = search_response.json().get('data', {}).get('webPages', {}).get('value', [])
        if not search_results:
            return [], "No relevant information found on the web for the past week."
        context, sources = "Web search results:\n\n", []
        for i, result in enumerate(search_results[:5]):
            title, url, snippet = result.get('name', 'No Title'), result.get('url', ''), result.get('snippet', 'No snippet available.')
            context += f"[{i+1}] Title: {title}\nURL: {url}\nSnippet: {snippet}\n\n"
            if url:
                sources.append({"title": title, "url": url})
        return sources, context
    except requests.exceptions.RequestException as e:
        print(f"Error calling Langsearch API: {e}")
        return [], f"An error occurred during web search: {e}"



def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def resize_image_if_needed(image_data, max_size=(1024, 1024), max_file_size_mb=5):
    """Resize image if it's too large"""
    try:
        # Open image from bytes
        img = Image.open(io.BytesIO(image_data))
        
        # Convert to RGB if necessary (for JPEG compatibility)
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGB')
        
        # Resize if needed
        img.thumbnail(max_size, Image.Resampling.LANCZOS)
        
        # Save back to bytes with quality optimization
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True)
        
        resized_data = output.getvalue()
        
        # Check file size (convert MB to bytes)
        if len(resized_data) > max_file_size_mb * 1024 * 1024:
            # If still too large, reduce quality
            output = io.BytesIO()
            img.save(output, format='JPEG', quality=60, optimize=True)
            resized_data = output.getvalue()
        
        return resized_data
    except Exception as e:
        print(f"Error resizing image: {e}")
        return image_data  # Return original if resize fails

# ✅ ENHANCED: Multi-image upload route
@app.route('/upload_images', methods=['POST'])
@login_required
def upload_images():
    if 'images' not in request.files:
        return jsonify({'error': 'No images provided'}), 400
    
    files = request.files.getlist('images')
    
    if not files or all(file.filename == '' for file in files):
        return jsonify({'error': 'No images selected'}), 400
    
    processed_images = []
    
    for file in files:
        if file and allowed_file(file.filename):
            try:
                # Read image data
                image_data = file.read()
                
                # Resize if needed
                resized_data = resize_image_if_needed(image_data)
                
                # Convert to base64
                base64_image = base64.b64encode(resized_data).decode('utf-8')
                
                # Get mime type
                mime_type = mimetypes.guess_type(file.filename)[0] or 'image/jpeg'
                
                processed_images.append({
                    'image_data': base64_image,
                    'mime_type': mime_type,
                    'filename': secure_filename(file.filename)
                })
                
            except Exception as e:
                print(f"Error processing image {file.filename}: {e}")
                return jsonify({'error': f'Error processing image {file.filename}: {str(e)}'}), 500
    
    if not processed_images:
        return jsonify({'error': 'No valid images processed'}), 400
    
    return jsonify({
        'success': True,
        'images': processed_images
    })

# ✅ ENHANCED: Chat route with multi-image support
@app.route('/chat', methods=['POST'])
@login_required
def chat():
    chat_data = request.json
    user_id = session['user']['id']

    def stream(data, current_user_id):
        user_message = data.get('message')
        history = data.get('history', [])
        conversation_id = data.get('conversation_id')
        model = data.get('model', "openai/gpt-oss-120b")
        force_web_search = data.get('force_web_search', False)
        
        # --- ADDED: Check if the selected model is from Groq ---
        is_groq_model = model == "openai/gpt-oss-120b"
        # ----------------------------------------------------
        
        # ✅ ENHANCED: Handle multiple images
        images_data = data.get('images_data', [])  # Array of image objects

        try:
            if not conversation_id:
                new_conv_res = supabase.table('conversations').insert({'user_id': current_user_id, 'title': user_message[:40]}).execute()
                new_conv_data = new_conv_res.data[0]
                conversation_id = new_conv_data['id']
                yield f"event: new_conversation\ndata: {json.dumps({'id': conversation_id, 'title': new_conv_data['title']})}\n\n"
        except Exception as e:
            print(f"Error creating new conversation: {e}")
            yield f"data: {json.dumps(f'Error: Could not start a new conversation. {str(e)}')}\n\n"
            yield "data: [DONE]\n\n"
            return
        
        # ✅ ENHANCED: Build message content with multiple images support
        message_content = []
        
        # Add text content
        if user_message:
            message_content.append({
                "type": "text",
                "text": user_message
            })
        
        # Add multiple images content if present
        for img_data in images_data:
            message_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{img_data['mime_type']};base64,{img_data['image_data']}",
                    "detail": "auto"
                }
            })
        
        # Build messages array
        messages = [
            {"role": "system", "content": "You are Srushti, an AI trained by Shreyash shastri. Write like a human, Keep your responses professional but conversational. Don't use em dashes or buzzwords. Avoid sounding like a press release, dont use very high level language, keep it natural, use high level language only when requested by user. Be Clear Direct and natural, like you're writing to a smart friend. Always Use web_search function to find relevant info. Always keep the user engaged, and Please dont write the search results, its just for you to understand, dont mention it in response no matter what. Tell the user only what they have asked; don't introduce additional topics. Keep your answers concise and strictly relevant."},
            *history,
            {"role": "user", "content": message_content if len(message_content) > 1 else user_message}
        ]
        
        full_ai_response, sources, all_reasoning = "", [], ""
        headers = {
            "Authorization": f"Bearer {os.getenv('OPENROUTER_API_KEY')}", "Content-Type": "application/json",
        }
        buffered_reasoning, tool_calls = "", None

        try:
            print("--- AI is thinking... (Combined Streaming Step) ---")
            if force_web_search:
                print(f"--- Web search was forced by user for: '{user_message}' ---")
                tool_calls = [{"id": "forced_search", "type": "function", "function": {"name": "web_search", "arguments": json.dumps({"query": user_message})}}]
            else:
                # ✅ MODIFIED: Only use tools if no images are present (many vision models don't support tools)
                tools_param = [web_search_tool] if not images_data else []
                buffered_content, tool_call_chunks = "", {}
                
                # --- MODIFIED: Use Groq client for the reasoning model ---
                if is_groq_model:
                    print("--- Using Groq API for initial call ---")
                    initial_response_stream = groq_client.chat.completions.create(
                        model=model,
                        messages=messages,
                        tools=tools_param,
                        stream=True,
                        max_tokens=4096,
                    )

                    for chunk in initial_response_stream:
                        delta = chunk.choices[0].delta
                        if delta.content:
                            buffered_content += delta.content
                            if not tool_call_chunks:
                                yield f"data: {json.dumps(delta.content)}\n\n"
                        
                        if delta.tool_calls and not images_data:
                            for tool_chunk in delta.tool_calls:
                                index = tool_chunk.index
                                if index not in tool_call_chunks: tool_call_chunks[index] = {}
                                if tool_chunk.id: tool_call_chunks[index]['id'] = tool_chunk.id
                                if tool_chunk.type: tool_call_chunks[index]['type'] = tool_chunk.type
                                if tool_chunk.function:
                                    if 'function' not in tool_call_chunks[index]: tool_call_chunks[index]['function'] = {}
                                    if tool_chunk.function.name: tool_call_chunks[index]['function']['name'] = tool_chunk.function.name
                                    if tool_chunk.function.arguments:
                                        if 'arguments' not in tool_call_chunks[index]['function']: tool_call_chunks[index]['function']['arguments'] = ""
                                        tool_call_chunks[index]['function']['arguments'] += tool_chunk.function.arguments
                else:
                    print("--- Using OpenRouter API for initial call ---")
                    initial_response = requests.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers=headers,
                        json={"model": model, "messages": messages, "tools": tools_param, "stream": True},
                        stream=True,
                        timeout=60
                    )
                    initial_response.raise_for_status()
                    
                    for line in initial_response.iter_lines():
                        if line and line.decode('utf-8').startswith('data: '):
                            data_str = line.decode('utf-8')[6:]
                            if data_str == '[DONE]': 
                                break
                            try:
                                chunk_data = json.loads(data_str)
                                if 'choices' not in chunk_data or not chunk_data['choices']:
                                    continue
                                chunk = chunk_data['choices'][0]['delta']
                                
                                # Handle reasoning content - buffer it, don't stream immediately
                                if chunk.get('reasoning'): 
                                    buffered_reasoning += chunk.get('reasoning', '')
                                
                                # Handle regular content
                                if chunk.get('content'): 
                                    content = chunk.get('content', '')
                                    buffered_content += content
                                    # Stream content immediately if no tool calls are being built
                                    if not tool_call_chunks:
                                        yield f"data: {json.dumps(content)}\n\n"
                                
                                # Handle tool calls (only if images not present)
                                if 'tool_calls' in chunk and not images_data:
                                    for tool_chunk in chunk['tool_calls']:
                                        index = tool_chunk['index']
                                        if index not in tool_call_chunks: tool_call_chunks[index] = {}
                                        if tool_chunk.get('id'): tool_call_chunks[index]['id'] = tool_chunk.get('id')
                                        if tool_chunk.get('type'): tool_call_chunks[index]['type'] = tool_chunk.get('type')
                                        if 'function' in tool_chunk:
                                            if 'function' not in tool_call_chunks[index]: tool_call_chunks[index]['function'] = {}
                                            if tool_chunk['function'].get('name'): tool_call_chunks[index]['function']['name'] = tool_chunk['function'].get('name')
                                            if tool_chunk['function'].get('arguments'):
                                                if 'arguments' not in tool_call_chunks[index]['function']: tool_call_chunks[index]['function']['arguments'] = ""
                                                tool_call_chunks[index]['function']['arguments'] += tool_chunk['function'].get('arguments')
                            except (json.JSONDecodeError, KeyError, IndexError) as e:
                                print(f"Error parsing chunk: {e}")
                                continue
                # --- End of conditional API call ---
                
                if tool_call_chunks: 
                    tool_calls = list(tool_call_chunks.values())
                
                # If we have content but no tool calls, we're done
                if buffered_content and not tool_calls:
                    full_ai_response = buffered_content

            # Handle tool calls (rest of the tool calling logic remains the same...)
            if tool_calls:
                # Send buffered reasoning as one complete chunk if we have it
                if buffered_reasoning:
                    all_reasoning = buffered_reasoning  # Store for database
                    yield f"event: reasoning\ndata: {json.dumps(buffered_reasoning)}\n\n"
                
                # Execute the tool call
                arguments_str = tool_calls[0].get('function', {}).get('arguments', '{}')
                try:
                    search_query = json.loads(arguments_str).get('query', user_message)
                except json.JSONDecodeError:
                    search_query = user_message
                
                print(f"--- AI decided to search for: '{search_query}' ---")
                
                sources, tool_result_content = perform_web_search(search_query)
                if sources: 
                    yield f"event: sources\ndata: {json.dumps(sources)}\n\n"
                
                # Build the assistant message with tool calls
                assistant_message = {"role": "assistant", "content": None, "tool_calls": tool_calls}
                if buffered_reasoning:
                    assistant_message['reasoning'] = buffered_reasoning
                
                # Add messages for tool execution
                messages.append(assistant_message)
                messages.append({"role": "tool", "tool_call_id": tool_calls[0]['id'], "content": tool_result_content})
                
                # Add explicit instruction for final response
                messages.append({
                    "role": "user",
                    "content": f"Based on the provided web search results, please give a comprehensive answer to my original question: '{user_message}'"
                })

                # --- MODIFIED: Use Groq or OpenRouter for the final summarization call ---
                if is_groq_model:
                    print("--- AI is generating the final response with Groq... ---")
                    final_response_stream = groq_client.chat.completions.create(
                        model=model,
                        messages=messages,
                        stream=True,
                        tool_choice="none",
                        temperature=0.7,
                        max_tokens=2000
                    )
                    for chunk in final_response_stream:
                        content = chunk.choices[0].delta.content
                        if content:
                            full_ai_response += content
                            yield f"data: {json.dumps(content)}\n\n"

                else:
                    print("--- AI is generating the final response with OpenRouter... ---")
                    final_response = requests.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers=headers,
                        json={
                            "model": model, 
                            "messages": messages, 
                            "stream": True,
                            "tool_choice": "none",
                            "temperature": 0.7,
                            "max_tokens": 2000
                        },
                        stream=True,
                        timeout=60 
                    )
                    final_response.raise_for_status()
                    
                    # Stream the final response (same logic as before...)
                    final_reasoning_buffer = ""
                    for line in final_response.iter_lines():
                        if line:
                            line_str = line.decode('utf-8')
                            if line_str.startswith('data: '):
                                data_str = line_str[6:]
                                if data_str == '[DONE]': 
                                    if final_reasoning_buffer:
                                        if all_reasoning: all_reasoning += "\n\n---\n\n" + final_reasoning_buffer
                                        else: all_reasoning = final_reasoning_buffer
                                        yield f"event: reasoning\ndata: {json.dumps(final_reasoning_buffer)}\n\n"
                                    break
                                try:
                                    chunk_data = json.loads(data_str)
                                    if 'choices' not in chunk_data or not chunk_data['choices']: continue
                                    delta = chunk_data['choices'][0]['delta']
                                    content = delta.get('content')
                                    reasoning = delta.get('reasoning')
                                    if reasoning: final_reasoning_buffer += reasoning
                                    if content:
                                        full_ai_response += content
                                        yield f"data: {json.dumps(content)}\n\n"
                                except (json.JSONDecodeError, KeyError, IndexError) as e:
                                    print(f"Error parsing final response chunk: {e}")
                                    continue
                # --- End of conditional final call ---
            
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            print(f"An error occurred in stream: {e}")
            traceback.print_exc()
            yield f"data: {json.dumps(f'An error occurred: {str(e)}')}\n\n"
            yield "data: [DONE]\n\n"
            return
        
        # ✅ FIXED: Save the conversation to database with proper multi-image support
        try:
            if full_ai_response:
                ai_message_data = {
                    'conversation_id': conversation_id, 
                    'sender': 'ai', 
                    'content': full_ai_response, 
                    'sources': sources or None
                }
                
                # ✅ FIXED: Save user message with multiple images support
                user_message_data = {
                    'conversation_id': conversation_id, 
                    'sender': 'user', 
                    'content': user_message or ''  # Ensure content is not None
                }
                
                # ✅ FIXED: Store multiple images properly
                if images_data:
                    user_message_data['has_image'] = True
                    urls_for_db = []

                    for img_data in images_data:
                        try:
                            # Decode base64 back to bytes
                            img_bytes = base64.b64decode(img_data['image_data'])
                            filename = f"{current_user_id}/{datetime.now().strftime('%Y%m%d%H%M%S%f')}_{secure_filename(img_data['filename'])}"

                            # Upload to Supabase Storage
                            storage_res = supabase.storage.from_("chat-images").upload(
                                filename,
                                img_bytes,
                                {"content-type": img_data['mime_type']}
                            )

                            # Get public URL
                            public_url = supabase.storage.from_("chat-images").get_public_url(filename)
                            urls_for_db.append(public_url)

                        except Exception as e:
                            print(f"Error uploading image: {e}")
                            continue

                    user_message_data['image_urls'] = urls_for_db
                
                # Add reasoning to the AI message if we have it
                if all_reasoning:
                    ai_message_data['reasoning'] = all_reasoning
                
                # Insert both messages
                supabase.table('messages').insert([
                    user_message_data,
                    ai_message_data
                ]).execute()
                print("--- Conversation saved successfully. ---")
                
        except Exception as e:
            print(f"Error saving conversation to database: {e}")
            traceback.print_exc()  # This will help debug the exact error

    return Response(stream(chat_data, user_id), mimetype='text/event-stream')

if __name__ == '__main__':
    app.run(debug=os.getenv("FLASK_DEBUG", "False") == "True")