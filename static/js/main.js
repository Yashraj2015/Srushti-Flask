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

    // --- ▼▼▼ Variable Declarations ▼▼▼ ---
    const messageInput = document.getElementById('message-input');
    const chatContainer = document.getElementById('chat-container');
    const webSearchToggle = document.getElementById('web-search-toggle');
    const imageUpload = document.getElementById('image-upload');
    const imagePreview = document.getElementById('image-preview');
    const imageUploadBtn = document.getElementById('image-upload-btn');
    const form = document.getElementById("chat-form");
    const textarea = document.getElementById("message-input");
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    let controller = null;

    const mainContent = document.getElementById('main-content-area');
    const codeContentEl = document.getElementById('code-content');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const copyBtnText = document.getElementById('copy-btn-text');
    // --- ▲▲▲ END OF Variable Declarations ▲▲▲ ---


    if (chatContainer) {
        chatContainer.addEventListener('click', (e) => {
            const trigger = e.target.closest('.code-trigger');
            if (trigger) {
                e.preventDefault(); 
                const lang = trigger.dataset.language;
                const code = trigger.dataset.code;
    
                if (lang && code) {
                    openCodePanel(lang, code);
                } else {
                    console.error("Code trigger clicked, but no code data found in data attributes.");
                }
            }
        });
    }

    // ✅ MODIFICATION: Added keydown listener for Enter/Shift+Enter functionality
    if (messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const submitButton = chatForm.querySelector('button[type="submit"]');
                if (submitButton && !submitButton.disabled) {
                    submitButton.click();
                }
            }
        });
    }

    form.addEventListener("click", (e) => {
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
        if(!ta) return;

        function autoResize(el) {
            el.style.height = '0px';
            const maxH = parseInt(getComputedStyle(el).maxHeight) || Infinity;
            const newH = Math.min(el.scrollHeight, maxH);
            el.style.height = newH + 'px';
            el.style.overflowY = (el.scrollHeight > maxH) ? 'auto' : 'hidden';
        }

        window.addEventListener('load', () => autoResize(ta));
        ta.addEventListener('input', () => autoResize(ta));

        document.getElementById('chat-form').addEventListener('submit', (e) => {
            setTimeout(() => autoResize(ta));
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

    async function handleImageUpload(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            await processMultipleImageFiles(files);
        }
    }

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
        // Assuming 'marked' and 'renderMathInElement' are globally available
        element.innerHTML = marked.parse(text, { gfm: true, breaks: true });
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

                if (reasoningContent) {
                    updateReasoning(messageBlock, reasoningContent);
                }
                renderFormattedContent(contentEl, displayContent);
            } else {
                renderFormattedContent(contentEl, rawText);
            }
        });
    }

    function showImagesPreview() {
        if (!imagePreview || currentImages.length === 0) return;
        const imagesHtml = currentImages.map((img, index) => `
            <div class="relative group">
                <img src="data:${img.mime_type};base64,${img.image_data}" alt="${img.filename}" class="w-20 h-20 object-cover rounded-lg">
                <button onclick="removeImage(${index})" class="absolute -top-2 -right-2 w-6 h-6 bg-slate-500 hover:bg-slate-600 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    ×
                </button>
            </div>
        `).join('');
        imagePreview.innerHTML = `<div class="flex flex-wrap gap-2 p-3 bg-transparent rounded-lg">${imagesHtml}</div>`;
        imagePreview.classList.remove('hidden');
    }

    window.removeImage = function(index) {
        currentImages.splice(index, 1);
        if (currentImages.length === 0) {
            clearImagesPreview();
        } else {
            showImagesPreview();
        }
    };

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
        setTimeout(() => errorDiv.remove(), 5000);
    }

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (!message && currentImages.length === 0) return;

        controller = new AbortController();
        sendBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');

        messageInput.value = '';
        messageInput.disabled = true;
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
                force_web_search: forceWebSearch,
            };
            if (imagesToSend.length > 0) {
                requestPayload.images_data = imagesToSend;
            }

            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestPayload),
                signal: controller.signal
            });

            if (!response.ok) throw new Error((await response.json()).error || 'Something went wrong');

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
                    // ⭐️ START: HANDLE THE NEW CODE PANEL EVENT
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
            if (error.name === 'AbortError') {
                console.log('Stream generation stopped by user.');
                const aiMessages = document.querySelectorAll('.message-block:not(.self-end)');
                if (aiMessages.length > 0) {
                    const lastAiBubble = aiMessages[aiMessages.length - 1].querySelector('.message-content');
                    if (lastAiBubble) {
                        lastAiBubble.innerHTML += `<br><i class="text-sm text-gray-400">You stopped this response.</i>`;
                    }
                }
            } else {
                console.error('Chat error:', error);
                appendMessage(`Error: ${error.message}`, 'ai', [], true);
            }
        } finally {
            messageInput.disabled = false;
            if (webSearchToggle) webSearchToggle.disabled = false;
            if (window.getSelectedModel) {
                const currentModel = window.getSelectedModel();
                if (currentModel === 'mistralai/mistral-small-3.2-24b-instruct:free') {
                    if (imageUploadBtn) imageUploadBtn.disabled = false;
                }
            }
            sendBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
            controller = null;
            messageInput.focus();
        }
    });

    stopBtn.addEventListener('click', () => {
        if (controller) {
            controller.abort();
        }
    });

    function appendMessage(content, sender, images = [], isError = false) {
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.remove();
    
        const messageBlock = document.createElement('div');
        let messageBlockClasses = 'message-block max-w-full';
        if (sender === 'user') {
            messageBlockClasses += ' self-end flex flex-col items-end';
        } else {
            messageBlockClasses += ' self-start';
        }
        messageBlock.className = messageBlockClasses;
    
        if (images && images.length > 0) {
            const imageContainer = document.createElement('div');
            imageContainer.className = 'flex flex-wrap gap-2 mb-2 justify-end';
            imageContainer.innerHTML = images.map(img =>
                `<img src="data:${img.mime_type};base64,${img.image_data}" alt="Uploaded image" class="w-36 h-36 bg-transparent rounded-2xl object-cover">`
            ).join('');
            messageBlock.appendChild(imageContainer);
        }
        
        // ⭐️ ADDED: For AI messages, create a dedicated container for tool UI (like buttons)
        if (sender === 'ai') {
            const toolUiContainer = document.createElement('div');
            toolUiContainer.className = 'tool-ui-container mb-1 ml-4'; // Margin bottom to space it from text
            messageBlock.appendChild(toolUiContainer);
        }
    
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
    
        const flexWrapper = document.createElement('div');
        flexWrapper.className = `flex w-full mb-6 ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
        flexWrapper.appendChild(messageBlock);
    
        const innerChatContainer = document.querySelector('#chat-container > .w-full.max-w-3xl.mx-auto.flex.flex-col');
        innerChatContainer.appendChild(flexWrapper);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        return messageBlock;
    }

    function appendSources(messageElement, sources) {
        if (!sources || sources.length === 0) return;
        const wrapper = document.createElement('div');
        const button = document.createElement('button');
        button.className = 'toggle-sources-btn mt-2 px-4 py-2 bg-transparent border border-1 hover:bg-gray-700 text-xs text-white rounded-xl flex items-center gap-2';
        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            Sources
        `;
        const sourcesContainer = document.createElement('div');
        sourcesContainer.className = 'sources-container mt-2 hidden';
        const sourcesList = document.createElement('div');
        sourcesList.className = 'flex flex-wrap gap-2';
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
        sourcesContainer.appendChild(sourcesList);
        wrapper.appendChild(button);
        wrapper.appendChild(sourcesContainer);
        messageElement.appendChild(wrapper);
    }

    function updateReasoning(messageElement, reasoningText) {
        if (reasoningText === undefined || reasoningText === null) return;
        const wrapper = messageElement.parentElement;
        if (!wrapper || !wrapper.parentElement) return;
        let existingReasoning = wrapper.previousElementSibling;
        if (!existingReasoning || !existingReasoning.classList.contains('reasoning-container')) {
            existingReasoning = null;
        }
        if (!existingReasoning) {
            const details = document.createElement('details');
            details.className = 'reasoning-container w-full mt-2 mb-2 px-2 text-sm font-semibold';
            const summary = document.createElement('summary');
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
            contentDiv.innerText = reasoningText;
        }
    }
 
    
    function getHistoryFromDOM() {
        const history = [];
        document.querySelectorAll('.message-block').forEach(block => {
            const role = block.classList.contains('self-end') ? 'user' : 'assistant';
            const contentEl = block.querySelector('.message-content');
            if (contentEl) {
                const imgEls = block.querySelectorAll('img'); // Look in the whole block
                let content = contentEl.innerText;
                if (imgEls.length > 0 && role === 'user') {
                    const multimodalContent = [{ type: "text", text: content }];
                    // This part seems incorrect as it re-adds images from history. 
                    // Sticking to text for now as images are sent in the payload.
                    // This function might need revision based on exact use case.
                    history.push({ role: role, content: content });
                } else {
                    history.push({ role: role, content: content });
                }
            }
        });
        return history.slice(0, -1); // Exclude the message we just added
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
        newLink.innerHTML = `<span>${title}</span>`;
        sidebarNav.prepend(newLink);
    }

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

    document.querySelectorAll('#sidebar nav a').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth < 768) {
                document.body.classList.add("sidebar-collapsed");
            }
        });
    });
});