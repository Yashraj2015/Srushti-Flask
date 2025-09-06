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

    const messageInput = document.getElementById('message-input');
    const chatContainer = document.getElementById('chat-container');
    const webSearchToggle = document.getElementById('web-search-toggle');
    const imageUpload = document.getElementById('image-upload');
    const imagePreview = document.getElementById('image-preview');
    const imageUploadBtn = document.getElementById('image-upload-btn');
    const form = document.getElementById("chat-form");
    const textarea = document.getElementById("message-input");

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

        messageInput.value = '';
        messageInput.disabled = true;
        chatForm.querySelector('button[type="submit"]').disabled = true;
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
            });

            if (!response.ok) throw new Error((await response.json()).error || 'Something went wrong');

            const aiMessageElement = appendMessage("", 'ai');
            const aiContentElement = aiMessageElement.querySelector('.message-content');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let combinedReasoningSSE = ""; // For the 'reasoning' SSE event
            let fullAiResponseText = ""; // For the main 'data' stream

            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    // The loop's processing of the last chunk has already set the final UI state.
                    // No extra rendering is needed here.
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split('\n\n');
                buffer = events.pop();

                for (const event of events) {
                    if (event.startsWith('event: new_conversation')) {
                        const data = JSON.parse(event.split('\n')[1].substring(6));
                        window.history.replaceState({}, '', `/conversation/${data.id}`);
                        addConversationToSidebar(data.id, data.title);
                    } else if (event.startsWith('event: sources')) {
                        const data = JSON.parse(event.split('\n')[1].substring(6));
                        appendSources(aiMessageElement, data);
                    } else if (event.startsWith('event: reasoning')) {
                        const data = JSON.parse(event.split('\n')[1].substring(6));
                        if (combinedReasoningSSE) {
                            combinedReasoningSSE += "\n\n---\n\n" + data;
                        } else {
                            combinedReasoningSSE = data;
                        }
                        updateReasoning(aiMessageElement, combinedReasoningSSE);
                    } else if (event.startsWith('data: ')) {
                        const data = event.substring(6);
                        if (data === '[DONE]') {
                            // The loop's processing of the last chunk has already set the final UI state.
                            reader.cancel();
                            break;
                        }
                        try {
                            const chunk = JSON.parse(data);
                            fullAiResponseText += chunk;
                            
                            // --- STREAMING LOGIC FOR REASONING AND MAIN CONTENT ---
                            let displayContent = "";
                            let reasoningContent = "";
                            const parts = fullAiResponseText.split(/(<think>|<\/think>)/s);

                            let isInsideThink = false;
                            for (const part of parts) {
                                if (part === '<think>') {
                                    isInsideThink = true;
                                    continue;
                                }
                                if (part === '</think>') {
                                    isInsideThink = false;
                                    continue;
                                }

                                if (part) {
                                    if (isInsideThink) {
                                        reasoningContent += part;
                                    } else {
                                        displayContent += part;
                                    }
                                }
                            }

                            if (reasoningContent) {
                                updateReasoning(aiMessageElement, reasoningContent);
                            }

                            renderFormattedContent(aiContentElement, displayContent);
                            chatContainer.scrollTop = chatContainer.scrollHeight;
                            // --- END OF STREAMING LOGIC ---

                        } catch (e) { /* Ignore non-JSON chunks */ }
                    }
                }
                if (reader.reason !== undefined) {
                    break;
                }
            }
        } catch (error) {
            console.error('Chat error:', error);
            appendMessage(`Error: ${error.message}`, 'ai', [], true);
        } finally {
            messageInput.disabled = false;
            chatForm.querySelector('button[type="submit"]').disabled = false;
            if (webSearchToggle) webSearchToggle.disabled = false;

            if (window.getSelectedModel) {
                 const currentModel = window.getSelectedModel();
                 if (currentModel === 'google/gemini-2.0-flash-exp:free') {
                     if (imageUploadBtn) imageUploadBtn.disabled = false;
                 }
            }
            messageInput.focus();
        }
    });

    function appendMessage(content, sender, images = [], isError = false) {
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.remove();

        const messageBlock = document.createElement('div');
        messageBlock.className = `message-block max-w-full ${sender === 'user' ? 'self-end' : 'self-start'}`;

        const bubble = document.createElement('div');
        bubble.className = `px-4 py-2 rounded-2xl break-words message-content ${sender === 'user' ? 'bg-[#333537] text-white mt-6' : 'text-gray-200 prose prose-invert'} ${isError ? 'bg-transparent border-red-700 border text-white' : ''}`;

        let bubbleContent = '';
        if (images && images.length > 0) {
            const imagesHtml = images.map(img =>
                `<img src="data:${img.mime_type};base64,${img.image_data}" alt="Uploaded image" class="max-w-full h-auto rounded-lg mb-2 max-h-96 object-contain">`
            ).join('');
            bubbleContent += `<div class="flex flex-wrap gap-2 mb-2">${imagesHtml}</div>`;
        }
        if (content) {
            bubbleContent += content.replace(/\n/g, '<br>');
        }

        bubble.innerHTML = bubbleContent;
        messageBlock.appendChild(bubble);

        const flexWrapper = document.createElement('div');
        flexWrapper.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} w-full`;
        flexWrapper.appendChild(messageBlock);

        const innerChatContainer = document.querySelector('#chat-container > .w-full.max-w-3xl.mx-auto.flex.flex-col');
        innerChatContainer.appendChild(flexWrapper);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return messageBlock;
    }

    function appendSources(messageElement, sources) {
        if (!sources || sources.length === 0) return;
        const sourcesContainer = document.createElement('div');
        sourcesContainer.className = 'mt-2 px-2 text-xs text-gray-400';
        const sourcesList = document.createElement('div');
        sourcesList.className = 'flex flex-wrap gap-2';
        sources.forEach(source => {
            const link = document.createElement('a');
            link.href = source.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = new URL(source.url).hostname;
            link.title = source.title;
            link.className = 'bg-[#333537] hover:bg-gray-600 px-2 py-1 rounded-full';
            sourcesList.appendChild(link);
        });
        sourcesContainer.appendChild(sourcesList);
        messageElement.appendChild(sourcesContainer);
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
            // Add `w-full` to make it span the container width
            details.className = 'reasoning-container w-full mt-2 mb-2 px-2 text-sm font-semibold';
            const summary = document.createElement('summary');
            summary.className = 'ml-2 text-gray-400 cursor-pointer hover:text-white';
            summary.innerHTML = 'Show Thinking';
            const content = document.createElement('div');
            content.className = 'reasoning-content pt-2 pl-4 text-gray-400 prose prose-sm whitespace-pre-wrap';
            details.appendChild(summary);
            details.appendChild(content);
    
            // Insert the new reasoning block *before* the entire message wrapper
            wrapper.parentElement.insertBefore(details, wrapper);
            existingReasoning = details;
        }
    
        const contentDiv = existingReasoning.querySelector('.reasoning-content');
        if (contentDiv) {
            // Use innerText to preserve formatting like newlines
            contentDiv.innerText = reasoningText;
        }
    }

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
        const gpt2oModelId = 'google/gemini-2.0-flash-exp:free';
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
        let selectedModel = localStorage.getItem("selectedModel") || "google/gemini-2.0-flash-exp:free";
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