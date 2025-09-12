function sortChatMessages() {
    const container = document.querySelector('#chat-container > .w-full.max-w-3xl.mx-auto.flex.flex-col');
    if (!container) {
        console.warn('Chat container for sorting not found.');
        return;
    }

    // Get all direct children, which are the message wrappers
    const messageWrappers = Array.from(container.children);

    // Filter out any non-message elements if necessary
    const filteredWrappers = messageWrappers.filter(el => el.querySelector('.message-block'));

    // Sort based on the 'data-timestamp' attribute of the message-block inside the wrapper
    filteredWrappers.sort((a, b) => {
        const blockA = a.querySelector('.message-block');
        const blockB = b.querySelector('.message-block');
        const timestampA = blockA ? blockA.dataset.timestamp : null;
        const timestampB = blockB ? blockB.dataset.timestamp : null;

        // If timestamps are missing or invalid, don't change their order relative to each other
        if (!timestampA || !timestampB) {
            return 0;
        }

        // Compare timestamps
        return new Date(timestampA) - new Date(timestampB);
    });

    // Re-append the sorted messages back to the container in the correct order
    filteredWrappers.forEach(wrapper => container.appendChild(wrapper));
}


document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    if (!chatForm) return; // Exit if not on the main chat page

    // ✅ NEW: Sort messages on load to fix rendering order.
    sortChatMessages();

    // --- ▼▼▼ MODIFIED PART 1: Variable Declarations ▼▼▼ ---
    const messageInput = document.getElementById('message-input');
    const chatContainer = document.getElementById('chat-container');
    const webSearchToggle = document.getElementById('web-search-toggle');
    const imageUpload = document.getElementById('image-upload');
    const imagePreview = document.getElementById('image-preview');
    const imageUploadBtn = document.getElementById('image-upload-btn');
    const form = document.getElementById("chat-form");
    const textarea = document.getElementById("message-input");

    // ADDED: Get references to the send/stop buttons and declare the AbortController variable.
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    let controller = null;
    // --- ▲▲▲ END OF MODIFIED PART 1 ▲▲▲ ---

    // ✅ MODIFICATION: Added keydown listener for Enter/Shift+Enter functionality
    if (messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            // Check if Enter is pressed without the Shift key
            if (e.key === 'Enter' && !e.shiftKey) {
                // Prevent the default action (which is to insert a new line)
                e.preventDefault();
                
                // Find the submit button and programmatically click it
                const submitButton = chatForm.querySelector('button[type="submit"]');
                if (submitButton && !submitButton.disabled) {
                    submitButton.click();
                }
            }
            // If Shift + Enter is pressed, the default browser action (inserting a new line) is allowed to happen.
        });
    }

    form.addEventListener("click", (e) => {
        // Don’t override clicks on actual inputs, buttons, or file upload
        if (
            e.target.tagName !== "TEXTAREA" &&
            e.target.tagName !== "INPUT" &&
            e.target.tagName !== "BUTTON" &&
            e.target.tagName !== "I" &&
            e.target.tagName !== "SPAN"
        ) {
            textarea.focus();
        }
    });

    (function () {
        const ta = document.getElementById('message-input');

        function autoResize(el) {
            // Reset height to measure correct scrollHeight
            el.style.height = '0px';
            // Respect Tailwind max-h-* in pixels if present
            const maxH = parseInt(getComputedStyle(el).maxHeight) || Infinity;
            const newH = Math.min(el.scrollHeight, maxH);
            el.style.height = newH + 'px';
            // Only show a scrollbar once we hit the cap
            el.style.overflowY = (el.scrollHeight > maxH) ? 'auto' : 'hidden';
        }

        // Initialize on load and keep updating as user types
        window.addEventListener('load', () => autoResize(ta));
        ta.addEventListener('input', () => autoResize(ta));

        // (Optional) If you clear the textarea on submit, re-shrink it
        document.getElementById('chat-form').addEventListener('submit', (e) => {
            // e.preventDefault(); // keep/remove depending on your submit handling
            setTimeout(() => autoResize(ta)); // let value clear first if you reset it
        });
    })();


    let forceWebSearch = false;
    let currentImages = []; // Array to store multiple images

    // Web search toggle
    if (webSearchToggle) {
        webSearchToggle.addEventListener('click', () => {
            forceWebSearch = !forceWebSearch;
            webSearchToggle.classList.toggle('text-blue-400', forceWebSearch);
            webSearchToggle.classList.toggle('text-gray-400', !forceWebSearch);
        });
    }

    // Multi-image upload functionality
    if (imageUploadBtn && imageUpload) {
        imageUploadBtn.addEventListener('click', () => {
            imageUpload.click();
        });

        imageUpload.setAttribute('multiple', true);
        imageUpload.addEventListener('change', handleImageUpload);
    }

    // Handle drag and drop for multiple images
    chatForm.addEventListener('dragover', (e) => {
        e.preventDefault();
        chatForm.classList.add('border-blue-400', 'bg-blue-50', 'bg-opacity-10');
    });

    chatForm.addEventListener('dragleave', (e) => {
        e.preventDefault();
        chatForm.classList.remove('border-blue-400', 'bg-blue-50', 'bg-opacity-10');
    });

    chatForm.addEventListener('drop', (e) => {
        e.preventDefault();
        chatForm.classList.remove('border-blue-400', 'bg-blue-50', 'bg-opacity-10');

        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        if (files.length > 0) {
            processMultipleImageFiles(files);
        }
    });

    // Handle paste events for images
    document.addEventListener('paste', (e) => {
        const items = Array.from(e.clipboardData.items);
        const imageFiles = items
            .filter(item => item.type.startsWith('image/'))
            .map(item => item.getAsFile())
            .filter(file => file !== null);

        if (imageFiles.length > 0) {
            e.preventDefault();
            processMultipleImageFiles(imageFiles);
        }
    });

    // Handle multiple image files
    async function handleImageUpload(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            await processMultipleImageFiles(files);
        }
    }

    // Process multiple image files
    async function processMultipleImageFiles(files) {
        const validFiles = files.filter(file => {
            if (!file.type.startsWith('image/')) {
                showError(`${file.name} is not a valid image file.`);
                return false;
            }
            if (file.size > 16 * 1024 * 1024) { // 16MB limit
                showError(`${file.name} is too large. Please select files smaller than 16MB.`);
                return false;
            }
            return true;
        });

        if (validFiles.length === 0) return;

        const formData = new FormData();
        validFiles.forEach(file => {
            formData.append('images', file);
        });

        try {
            showImageProcessing(true);
            const response = await fetch('/upload_images', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                currentImages = [...currentImages, ...result.images];
                showImagesPreview();
            } else {
                showError(result.error || 'Failed to upload images');
            }
        } catch (error) {
            console.error('Images upload error:', error);
            showError('Failed to upload images. Please try again.');
        } finally {
            showImageProcessing(false);
            if (imageUpload) imageUpload.value = ''; // Clear file input
        }
    }

    function renderFormattedContent(element, text) {
        if (!element) return;
        if (!text) {
            element.innerHTML = '';
            return;
        }
        // 1. Convert Markdown to HTML using marked.js
        element.innerHTML = marked.parse(text, { gfm: true, breaks: true });

        // 2. Use KaTeX auto-render to find and render LaTeX
        renderMathInElement(element, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\(', right: '\\)', display: false},
                {left: '\\[', right: '\\]', display: true}
            ],
            throwOnError: false
        });
    }

    // --- NEW --- This function will parse all messages on page load
    function parseAndRenderExistingMessages() {
        document.querySelectorAll('.message-block:not(.self-end)').forEach(messageBlock => {
            const contentEl = messageBlock.querySelector('.message-content');
            if (!contentEl || !contentEl.dataset.raw) {
                if (contentEl) {
                    renderFormattedContent(contentEl, contentEl.textContent);
                }
                return;
            }

            const rawText = contentEl.dataset.raw;
            const thinkMatch = rawText.match(/<think>([\s\S]*?)<\/think>/s);

            if (thinkMatch && thinkMatch[1]) {
                const reasoningContent = thinkMatch[1].trim();
                const displayContent = rawText.replace(/<think>[\s\S]*?<\/think>/s, '').trim();

                // Create the reasoning <details> block from the parsed content
                if (reasoningContent) {
                   updateReasoning(messageBlock, reasoningContent);
                }

                // Render the cleaned main content
                renderFormattedContent(contentEl, displayContent);
            } else {
                // No reasoning found, just render the raw content with formatting
                renderFormattedContent(contentEl, rawText);
            }
        });
    }


    // Show multiple images preview
    function showImagesPreview() {
        if (!imagePreview || currentImages.length === 0) return;

        const imagesHtml = currentImages.map((img, index) => `
            <div class="relative group">
                <img src="data:${img.mime_type};base64,${img.image_data}"
                     alt="${img.filename}"
                     class="w-20 h-20 object-cover rounded-lg">
                <button onclick="removeImage(${index})"
                        class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    ×
                </button>
            </div>
        `).join('');

        imagePreview.innerHTML = `
            <div class="flex flex-wrap gap-2 p-3 bg-transparent rounded-lg">
                ${imagesHtml}
            </div>
        `;

        imagePreview.classList.remove('hidden');
    }

    // Remove individual image function (make it global)
    window.removeImage = function(index) {
        currentImages.splice(index, 1);
        if (currentImages.length === 0) {
            clearImagesPreview();
        } else {
            showImagesPreview();
        }
    };

    // Clear all images preview
    function clearImagesPreview() {
        if (!imagePreview) return;

        imagePreview.classList.add('hidden');
        imagePreview.innerHTML = '';
        currentImages = [];
        if (imageUpload) imageUpload.value = '';
    }

    function showImageProcessing(show) {
        const btn = imageUploadBtn;
        if (!btn) return;

        if (show) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        } else {
            btn.disabled = false;
            btn.innerHTML = '<i class="far fa-image"></i>';
        }
    }

    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fixed top-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg z-50';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);

        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }

    // Form submission with multi-image support
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();

        if (!message && currentImages.length === 0) return;

        // ADDED: Initialize the controller and swap to the stop button
        controller = new AbortController();
        sendBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');

        // Your existing UI disabling logic
        messageInput.value = '';
        messageInput.disabled = true;
        // The line below is no longer needed as we hide the send button
        // chatForm.querySelector('button[type="submit"]').disabled = true;
        if (webSearchToggle) webSearchToggle.disabled = true;
        if (imageUploadBtn) imageUploadBtn.disabled = true;

        appendMessage(message, 'user', currentImages);

        const imagesToSend = [...currentImages];
        clearImagesPreview();

        const history = getHistoryFromDOM();

        let conversationId = window.location.pathname.split('/').pop();
        if (!/^[0-9a-fA-F-]{36}$/.test(conversationId)) {
            conversationId = null;
        }

        // MODIFIED: Wrapped your entire fetch logic in a new try/catch/finally block
        try {
            const requestPayload = {
                message: message,
                history: history,
                conversation_id: conversationId,
                model: window.getSelectedModel ? window.getSelectedModel() : "z-ai/glm-4.5-air:free",
                force_web_search: forceWebSearch
            };

            if (imagesToSend.length > 0) {
                requestPayload.images_data = imagesToSend;
            }

            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestPayload),
                signal: controller.signal // ADDED: Pass the AbortSignal to the fetch request
            });

            if (!response.ok) throw new Error((await response.json()).error || 'Something went wrong');

            // Your existing stream reading logic is already robust and stays inside the try block.
            const aiMessageElement = appendMessage("", 'ai');
            const aiContentElement = aiMessageElement.querySelector('.message-content');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let combinedReasoningSSE = "";
            let fullAiResponseText = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split('\n\n');
                buffer = events.pop();

                for (const event of events) {
                    // Your existing event handling (new_conversation, sources, etc.)
                    if (event.startsWith('event: new_conversation')) {
                        const data = JSON.parse(event.split('\n')[1].substring(6));
                        window.history.replaceState({}, '', `/conversation/${data.id}`);
                        addConversationToSidebar(data.id, data.title);
                    } else if (event.startsWith('event: sources')) {
                        const data = JSON.parse(event.split('\n')[1].substring(6));
                        appendSources(aiMessageElement, data);
                    } else if (event.startsWith('event: reasoning')) {
                        const data = JSON.parse(event.split('\n')[1].substring(6));
                        combinedReasoningSSE = combinedReasoningSSE ? `${combinedReasoningSSE}\n\n---\n\n${data}` : data;
                        updateReasoning(aiMessageElement, combinedReasoningSSE);
                    } else if (event.startsWith('data: ')) {
                        const data = event.substring(6);
                        if (data === '[DONE]') {
                            reader.cancel();
                            break;
                        }
                        try {
                            const chunk = JSON.parse(data);
                            fullAiResponseText += chunk;
                            let displayContent = "";
                            let reasoningContent = "";
                            const parts = fullAiResponseText.split(/(<think>|<\/think>)/s);
                            let isInsideThink = false;
                            for (const part of parts) {
                                if (part === '<think>') { isInsideThink = true; continue; }
                                if (part === '</think>') { isInsideThink = false; continue; }
                                if (part) {
                                    if (isInsideThink) { reasoningContent += part; } 
                                    else { displayContent += part; }
                                }
                            }
                            if (reasoningContent) updateReasoning(aiMessageElement, reasoningContent);
                            renderFormattedContent(aiContentElement, displayContent);
                            chatContainer.scrollTop = chatContainer.scrollHeight;
                        } catch (e) { /* Ignore */ }
                    }
                }
                if (reader.reason !== undefined) break;
            }
        } catch (error) {
            // MODIFIED: Added specific handling for user-triggered abort.
            if (error.name === 'AbortError') {
                console.log('Stream generation stopped by user.');
                // Add a "stopped" message to the UI for better feedback
                const aiMessages = document.querySelectorAll('.message-block:not(.self-end)');
                if (aiMessages.length > 0) {
                    const lastAiBubble = aiMessages[aiMessages.length - 1].querySelector('.message-content');
                    if (lastAiBubble) {
                         lastAiBubble.innerHTML += `<br><i class="text-sm text-gray-400">You stopped this response.</i>`;
                    }
                }
            } else {
                // Your existing general error handling
                console.error('Chat error:', error);
                appendMessage(`Error: ${error.message}`, 'ai', [], true);
            }
        } finally {
            // MODIFIED: Reset the stop button and controller in the finally block.
            messageInput.disabled = false;
            if (webSearchToggle) webSearchToggle.disabled = false;

            if (window.getSelectedModel) {
                 const currentModel = window.getSelectedModel();
                 if (currentModel === 'mistralai/mistral-small-3.2-24b-instruct:free') {
                     if (imageUploadBtn) imageUploadBtn.disabled = false;
                 }
            }

            // ADDED: UI reset for stop generation feature
            sendBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
            controller = null; // Clear the controller for the next request

            messageInput.focus();
        }
    });
    // --- ▲▲▲ END OF MODIFIED PART 2 ▲▲▲ ---

    stopBtn.addEventListener('click', () => {
        if (controller) {
            controller.abort(); // This is what cancels the fetch stream
        }
    });

    function appendMessage(content, sender, images = [], isError = false) {
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.remove();
    
        const messageBlock = document.createElement('div');
        
        // Default classes for the message's content block
        let messageBlockClasses = 'message-block max-w-full';
    
        // FIX #2: For user messages, make the block a flex column and align items (like the text bubble) to the end (right).
        // This prevents the text bubble from stretching under wider images.
        if (sender === 'user') {
            messageBlockClasses += ' self-end flex flex-col items-end';
        } else {
            messageBlockClasses += ' self-start';
        }
        messageBlock.className = messageBlockClasses;
    
        // Create and append the image container if images exist
        if (images && images.length > 0) {
            const imageContainer = document.createElement('div');
            imageContainer.className = 'flex flex-wrap gap-2 mb-2 justify-end';
            imageContainer.innerHTML = images.map(img =>
                `<img src="data:${img.mime_type};base64,${img.image_data}" alt="Uploaded image" class="w-36 h-36 bg-transparent rounded-2xl object-cover">`
            ).join('');
            messageBlock.appendChild(imageContainer);
        }
    
        // FIX #1: Corrected condition to ensure an empty bubble is always created for the AI to stream its response into.
        if (content || isError || sender === 'ai') {
            const bubble = document.createElement('div');
            bubble.className = `px-4 py-2 rounded-2xl break-words message-content ${
                sender === 'user' ? 'bg-[#333537] text-white' : 'text-gray-200 prose prose-invert'
            } ${isError ? 'bg-red-500/20 border border-red-500/50 text-red-300' : ''}`;
            
            if (images && images.length > 0 && content) {
                bubble.classList.add('mt-2');
            }
    
            bubble.innerHTML = content.replace(/\n/g, '<br>');
            messageBlock.appendChild(bubble);
        }
    
        // Create the final flex wrapper for alignment and spacing
        const flexWrapper = document.createElement('div');
        flexWrapper.className = `flex w-full mb-6 ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
        flexWrapper.appendChild(messageBlock);
    
        // Append the fully constructed message to the chat container
        const innerChatContainer = document.querySelector('#chat-container > .w-full.max-w-3xl.mx-auto.flex.flex-col');
        innerChatContainer.appendChild(flexWrapper);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        return messageBlock;
    }

    function appendSources(messageElement, sources) {
        if (!sources || sources.length === 0) return;
    
        // 1. Create the main wrapper for the button and the list
        const wrapper = document.createElement('div');
    
        // 2. Create the "Sources" button with all necessary classes
        const button = document.createElement('button');
        button.className = 'toggle-sources-btn mt-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-xs text-white rounded-xl flex items-center gap-2';
        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            Sources
        `;
    
        // 3. Create the container for the links (initially hidden)
        const sourcesContainer = document.createElement('div');
        sourcesContainer.className = 'sources-container mt-2 hidden';
    
        // 4. Create the inner div for the flex layout
        const sourcesList = document.createElement('div');
        sourcesList.className = 'flex flex-wrap gap-2';
    
        // 5. Create and add each source link with its logo
        sources.forEach(source => {
            const link = document.createElement('a');
            link.href = source.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.title = source.title;
            link.className = 'flex items-center bg-[#333537] hover:bg-gray-600 px-2 py-1 rounded-full text-xs text-gray-400';
            
            const domain = new URL(source.url).hostname;
            
            link.innerHTML = `
                <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=16" alt="Favicon" class="w-4 h-4 mr-1.5 rounded-sm" />
                <span>${domain}</span>
            `;
            sourcesList.appendChild(link);
        });
    
        // 6. Assemble the final HTML structure
        sourcesContainer.appendChild(sourcesList);
        wrapper.appendChild(button);
        wrapper.appendChild(sourcesContainer);
        
        // 7. Add the entire component to the message element in the DOM
        messageElement.appendChild(wrapper);
    }

    // This function now places the reasoning block *before* the message's wrapper.
    function updateReasoning(messageElement, reasoningText) {
        if (reasoningText === undefined || reasoningText === null) return;
    
        // messageElement is the .message-block
        const wrapper = messageElement.parentElement; // This is the .flex.justify-start div
        if (!wrapper || !wrapper.parentElement) return;
    
        // Try to find an existing reasoning block as the previous sibling of the message wrapper
        let existingReasoning = wrapper.previousElementSibling;
        if (!existingReasoning || !existingReasoning.classList.contains('reasoning-container')) {
            existingReasoning = null; // It's not a reasoning block
        }
    
        if (!existingReasoning) {
            const details = document.createElement('details');
            details.className = 'reasoning-container w-full mt-2 mb-2 px-2 text-sm font-semibold';
            const summary = document.createElement('summary');
    
            // ✅ MODIFIED LINE: Matched classes from index.html for consistency
            summary.className = 'inline-block text-white cursor-pointer hover:text-white py-2 px-3 rounded-xl';
            
            summary.innerHTML = 'Show Thinking';
            const content = document.createElement('div');
            content.className = 'reasoning-content pt-2 pl-4 border-l-2 border-gray-600 text-gray-400 prose prose-sm whitespace-pre-wrap';
            details.appendChild(summary);
            details.appendChild(content);
    
            wrapper.parentElement.insertBefore(details, wrapper);
            existingReasoning = details;
        }
    
        const contentDiv = existingReasoning.querySelector('.reasoning-content');
        if (contentDiv) {
            // Use innerText to preserve formatting like newlines
            contentDiv.innerText = reasoningText;
        }
    }

    function renderAiMessageWithCodePanels(element) {
        // Prevent processing the same element twice
        if (element.dataset.processed === 'true') return;
    
        const rawContent = element.dataset.raw;
        if (!rawContent) return;
    
        const parsedHtml = marked.parse(rawContent);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = parsedHtml;
    
        const pres = Array.from(tempDiv.querySelectorAll('pre'));
        pres.forEach(preElement => {
            const codeBlock = preElement.querySelector('code');
            if (!codeBlock) return;
    
            const originalParent = preElement.parentNode;
            const language = [...codeBlock.classList].find(cls => cls.startsWith('language-'))?.replace('language-', '') || 'plaintext';
    
            const panel = document.createElement('div');
            panel.className = 'code-panel bg-[#131314] rounded-xl overflow-hidden my-4';
            panel.innerHTML = `
                <div class="code-header flex items-center justify-between px-4 py-1.5 text-xs text-gray-400">
                    <span class="font-mono select-none">${language}</span>
                    <button class="copy-code-btn flex items-center gap-1.5 transition-colors">
                        <i class="far fa-copy"></i> <span>Copy code</span>
                    </button>
                </div>
                <div class="code-body p-4 custom-scrollbar overflow-x-auto"></div>
            `;
            
            originalParent.insertBefore(panel, preElement);
            panel.querySelector('.code-body').appendChild(preElement);
            codeBlock.setAttribute('contenteditable', 'true');
            codeBlock.setAttribute('spellcheck', 'false');
        });
    
        element.innerHTML = tempDiv.innerHTML;
        element.dataset.processed = 'true'; // Mark as processed
    
        // Add event listeners for the new "Copy" buttons
        element.querySelectorAll('.copy-code-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const codeText = btn.closest('.code-panel').querySelector('code').innerText;
                navigator.clipboard.writeText(codeText).then(() => {
                    const originalContent = btn.innerHTML;
                    btn.innerHTML = `<i class="fas fa-check"></i> <span>Copied!</span>`;
                    setTimeout(() => { btn.innerHTML = originalContent; }, 2000);
                });
            });
        });
    
        // Re-run KaTeX and highlight.js on the newly added content
        renderMathInElement(element, { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }] });
        element.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
    }
    
    
    // This function will run for messages that exist on page load
    function processInitialMessages() {
        document.querySelectorAll(".message-content.prose-invert").forEach(el => {
            renderAiMessageWithCodePanels(el);
        });
    }
    
    // This observer will handle all new, streamed messages
    function observeChatContainer() {
        const chatContainer = document.getElementById('chat-container');
        if (!chatContainer) return;
    
        const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        // We only care about element nodes
                        if (node.nodeType === 1) {
                            // Find the AI message content divs within the new node
                            const aiMessages = node.querySelectorAll('.message-content.prose-invert');
                            aiMessages.forEach(aiMessage => {
                               // The streaming creates the element first, then fills it.
                               // We need to wait for the [DONE] signal or just process it.
                               // A simple approach is to find the final container.
                               renderAiMessageWithCodePanels(aiMessage);
                            });
                        }
                    });
                }
            }
        });
    
        observer.observe(chatContainer, { childList: true, subtree: true });
    }
    
    // Run everything when the page is ready
    document.addEventListener('DOMContentLoaded', () => {
        processInitialMessages();
        observeChatContainer();
    });
    

    function getHistoryFromDOM() {
        const history = [];
        document.querySelectorAll('.message-block').forEach(block => {
            const role = block.classList.contains('self-end') ? 'user' : 'assistant';
            const contentEl = block.querySelector('.message-content');
            if (contentEl) {
                const imgEls = contentEl.querySelectorAll('img');
                let content = contentEl.innerText;
                if (imgEls.length > 0 && role === 'user') {
                    const multimodalContent = [{ type: "text", text: content }];
                    imgEls.forEach(img => {
                        multimodalContent.push({
                            type: "image_url",
                            image_url: { url: img.src, detail: "auto" }
                        });
                    });
                    content = multimodalContent;
                }
                history.push({ role: role, content: content });
            }
        });
        return history;
    }

    function addConversationToSidebar(id, title) {
        const sidebarNav = document.querySelector('#sidebar nav');
        if (!sidebarNav) {
            console.error("Could not find '#sidebar nav' to add new conversation link.");
            return;
        }
        const newLink = document.createElement('a');
        newLink.href = `/conversation/${id}`;
        newLink.className = 'flex items-center py-2 px-3 text-sm text-gray-300 rounded-xl hover:bg-[#252627] transition-colors duration-200 truncate';
        newLink.innerHTML = `</i><span>${title}</span>`;
        sidebarNav.prepend(newLink);
    }

    // Call the new function on page load to fix existing messages
    parseAndRenderExistingMessages();

    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
});


// General UI listeners for layout (NO CHANGES HERE)
document.addEventListener("DOMContentLoaded", () => {
    const body = document.body;
    const closeBtn = document.getElementById("close-sidebar-btn");
    const openBtn = document.getElementById("open-sidebar-btn");
    const profileBtn = document.getElementById("profile-btn");
    const logoutBtn = document.getElementById("logout-btn");
    const dropdownBtn = document.getElementById("dropdown-btn");
    const dropdownMenu = document.getElementById("dropdown-menu");
    const dropdownLabel = document.getElementById("dropdown-label");

    if (closeBtn) closeBtn.addEventListener("click", () => body.classList.add("sidebar-collapsed"));
    if (openBtn) openBtn.addEventListener("click", () => body.classList.remove("sidebar-collapsed"));

    if (profileBtn && logoutBtn) {
        profileBtn.addEventListener("click", (e) => { e.stopPropagation(); logoutBtn.classList.toggle("hidden"); });
        document.addEventListener("click", (e) => {
            if (!profileBtn.contains(e.target) && !logoutBtn.contains(e.target)) {
                logoutBtn.classList.add("hidden");
            }
        });
    }

    function updateUploadButtonState(modelId) {
        const imageUploadBtn = document.getElementById('image-upload-btn');
        const gpt2oModelId = 'mistralai/mistral-small-3.2-24b-instruct:free';
        if (!imageUploadBtn) return;
        if (modelId === gpt2oModelId) {
            imageUploadBtn.disabled = false;
            imageUploadBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            imageUploadBtn.title = 'Upload Images';
        } else {
            imageUploadBtn.disabled = true;
            imageUploadBtn.classList.add('opacity-50', 'cursor-not-allowed');
            imageUploadBtn.title = 'Image upload is only available for GPT 2o';
        }
    }

    // Model Dropdown Logic
    if (dropdownBtn && dropdownMenu && dropdownLabel) {
        let selectedModel = localStorage.getItem("selectedModel") || "mistralai/mistral-small-3.2-24b-instruct:free";
        let selectedLabel = localStorage.getItem("selectedLabel") || "GPT 2o";
        dropdownLabel.textContent = selectedLabel;

        updateUploadButtonState(selectedModel);

        dropdownBtn.addEventListener("click", (e) => { e.stopPropagation(); dropdownMenu.classList.toggle("hidden"); });

        dropdownMenu.querySelectorAll("button").forEach(btn => {
            btn.addEventListener("click", () => {
                selectedModel = btn.getAttribute("data-value");
                selectedLabel = btn.innerText.trim();
                dropdownLabel.textContent = selectedLabel;
                dropdownMenu.classList.add("hidden");
                localStorage.setItem("selectedModel", selectedModel);
                localStorage.setItem("selectedLabel", selectedLabel);
                updateUploadButtonState(selectedModel);
            });
        });
        document.addEventListener("click", () => dropdownMenu.classList.add("hidden"));
        window.getSelectedModel = () => selectedModel;
    }

    // Sidebar link click for mobile
    document.querySelectorAll('#sidebar nav a').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth < 768) {
                document.body.classList.add("sidebar-collapsed");
            }
        });
    });
});