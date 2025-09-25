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

    const codeEditorPanel = document.getElementById('code-editor-panel');
    const codeEditorContent = document.getElementById('code-editor-content');
    const codeEditorCloseBtn = document.getElementById('code-editor-close-btn');
    const codeEditorCopyBtn = document.getElementById('code-editor-copy-btn');
    const codeEditorDownloadBtn = document.getElementById('code-editor-download-btn');
    const mainContent = document.getElementById('main-content');
    const resizeHandle = document.getElementById('resize-handle');
    const codeEditorUndoBtn = document.getElementById('code-editor-undo-btn');
    const thinkToggle = document.getElementById('think-toggle');
    let forceThinking = false;
    let activeCodeBlock = { pre: null, showButton: null }; // To track the currently edited block
    let isResizing = false;
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

    if (thinkToggle) {
        thinkToggle.addEventListener('click', () => {
            forceThinking = !forceThinking;
            thinkToggle.classList.toggle('text-purple-400', forceThinking);
            thinkToggle.classList.toggle('text-gray-400', !forceThinking);
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

        addButtonsToCodeBlocks(element);
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

    function getCodeLanguage(codeElement) {
        if (!codeElement) return 'plaintext';
        const languageClass = Array.from(codeElement.classList).find(cls => cls.startsWith('language-'));
        return languageClass ? languageClass.replace('language-', '') : 'plaintext';
    }

    // ✅ FIXED: Proper resize function with correct name and implementation
    
    
    // ✅ FIXED: Proper stop resize function
    function stopResize() {
        isResizing = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    }

    // ✅ FIXED: Start resize function
    function startResize(e) {
        isResizing = true;
        e.preventDefault();
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }

    let originalCodeContent = ""; // Store the original AI-provided code
    let currentEditedCode = ""; // Store the current edited version
    let codeEditorTextarea = null; // Reference to the textarea element

    function openCodeEditorPanel(preElement) {
        if (!preElement || !codeEditorPanel || !mainContent) return;
    
        // Restore any previously hidden code block
        if (activeCodeBlock.pre && activeCodeBlock.showButton) {
            activeCodeBlock.pre.style.display = 'block';
            if (activeCodeBlock.showButton.parentNode) activeCodeBlock.showButton.remove();
        }
    
        const codeElement = preElement.querySelector('code');
        const codeText = codeElement.innerText;
        const language = getCodeLanguage(codeElement);
        
        // Store original content for undo functionality
        originalCodeContent = codeText;
        
        // Check if we have saved edited content for this code block
        const codeBlockId = generateCodeBlockId(preElement);
        const savedContent = localStorage.getItem(`edited_code_${codeBlockId}`);
        currentEditedCode = savedContent || codeText;
        
        // Clear existing language classes
        const classes = Array.from(codeEditorContent.classList);
        for (const cls of classes) {
            if (cls.startsWith('language-')) codeEditorContent.classList.remove(cls);
        }
        codeEditorContent.classList.add(`language-${language}`);
        
        // Replace the read-only <code> element with an editable <textarea>
        setupEditableCodeEditor(currentEditedCode, language, codeBlockId);
        
        // Show the panel
        codeEditorPanel.style.display = 'flex';
        codeEditorPanel.classList.add('show');
    
        // Hide the original code block and show replacement button
        preElement.style.display = 'none';
        const showButton = document.createElement('button');
        showButton.className = 'show-editor-button';
        showButton.innerHTML = `<i class="fa-regular fa-file"></i> Opened in Canvas`;
        showButton.onclick = () => openCodeEditorPanel(preElement);
        preElement.parentNode.insertBefore(showButton, preElement);
    
        activeCodeBlock = { pre: preElement, showButton: showButton };
    }
    
    function generateCodeBlockId(preElement) {
        // Create a simple hash based on the code content and position
        const codeText = preElement.querySelector('code').innerText;
        const hash = codeText.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        return Math.abs(hash).toString();
    }

    function setupEditableCodeEditor(content, language, codeBlockId) {
        const wrapper = document.getElementById('code-editor-content-wrapper');
        
        // Clear the wrapper and create a textarea instead of pre/code
        wrapper.innerHTML = '';
        
        // Store language in wrapper for later reference
        wrapper.dataset.language = language;
        
        codeEditorTextarea = document.createElement('textarea');
        codeEditorTextarea.id = 'code-editor-textarea';
        codeEditorTextarea.value = content;
        codeEditorTextarea.className = `w-full h-full bg-transparent text-gray-300 resize-none outline-none p-4 font-mono text-sm leading-relaxed`;
        codeEditorTextarea.style.minHeight = '100%';
        codeEditorTextarea.setAttribute('spellcheck', 'false');
        
        // Add input event listener to save changes automatically
        codeEditorTextarea.addEventListener('input', () => {
            currentEditedCode = codeEditorTextarea.value;
            localStorage.setItem(`edited_code_${codeBlockId}`, currentEditedCode);
            
            // Update the undo button state
            updateUndoButtonState();
        });
        
        wrapper.appendChild(codeEditorTextarea);
        
        // Focus the textarea and update undo button state
        setTimeout(() => {
            codeEditorTextarea.focus();
            updateUndoButtonState(); // Initialize undo button state
        }, 100);
    }
    
    function updateUndoButtonState() {
        const undoBtn = document.getElementById('code-editor-undo-btn');
        if (undoBtn) {
            // Enable undo if current content differs from original
            const hasChanges = currentEditedCode !== originalCodeContent;
            undoBtn.disabled = !hasChanges;
            undoBtn.style.opacity = hasChanges ? '1' : '0.5';
        }
    }
    
    // Update your existing closeCodeEditorPanel function
    function closeCodeEditorPanel() {
        if (!codeEditorPanel || !mainContent) return;
    
        // Hide the panel
        codeEditorPanel.style.display = 'none';
        codeEditorPanel.classList.remove('show');
    
        // Restore the original code block
        if (activeCodeBlock.pre && activeCodeBlock.showButton) {
            activeCodeBlock.pre.style.display = 'block';
            if (activeCodeBlock.showButton.parentNode) {
                activeCodeBlock.showButton.remove();
            }
        }
        
        // Clear references
        activeCodeBlock = { pre: null, showButton: null };
        codeEditorTextarea = null;
    }
    
    function handleResize(e) {
        if (!isResizing || !codeEditorPanel) return;
        
        // ✅ FIXED: Better resize calculation
        const mainContainer = document.getElementById('main-container');
        if (!mainContainer) return;
        
        const containerRect = mainContainer.getBoundingClientRect();
        const newWidth = containerRect.right - e.clientX;
        const maxWidth = containerRect.width * 0.8; // Max 80% of container
        const minWidth = 300; // Minimum width
    
        // ✅ FIXED: Apply constraints and update width
        if (newWidth >= minWidth && newWidth <= maxWidth) {
            codeEditorPanel.style.width = newWidth + 'px';
        }
    }
    
    function stopResize() {
        isResizing = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
        document.body.classList.remove('resizing');
    }
    
    function startResize(e) {
        isResizing = true;
        e.preventDefault();
        e.stopPropagation();
        
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
        document.body.classList.add('resizing');
    }
    
    // ✅ FIXED: Better window resize handling
    window.addEventListener('resize', () => {
        if (codeEditorPanel && codeEditorPanel.style.display === 'flex') {
            const mainContainer = document.getElementById('main-container');
            if (!mainContainer) return;
            
            const currentWidth = parseInt(codeEditorPanel.style.width) || 600;
            const containerWidth = mainContainer.offsetWidth;
            const maxWidth = containerWidth * 0.8;
            const minWidth = 300;
            
            // Ensure the panel width stays within bounds
            const newWidth = Math.min(Math.max(currentWidth, minWidth), maxWidth);
            if (newWidth !== currentWidth) {
                codeEditorPanel.style.width = newWidth + 'px';
            }
        }
    });
    
    // ✅ FIXED: Better escape key handling
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && codeEditorPanel && codeEditorPanel.style.display === 'flex') {
            closeCodeEditorPanel();
        }
    });

    function addButtonsToCodeBlocks(parentElement) {
        if (!parentElement) return;
    
        const codeBlocks = parentElement.querySelectorAll('pre');
        
        codeBlocks.forEach(pre => {
            // Avoid adding buttons multiple times
            if (pre.querySelector('.code-block-buttons')) {
                return;
            }
    
            const codeElement = pre.querySelector('code');
            if (!codeElement) return;
    
            // Add language name display
            const language = getCodeLanguage(codeElement);
            const langTag = document.createElement('span');
            langTag.className = 'code-language-tag';
            langTag.textContent = language;
            pre.appendChild(langTag);
    
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'code-block-buttons';
    
            // 1. Copy Button 📋
            const copyButton = document.createElement('button');
            copyButton.innerHTML = '<i class="far fa-copy"></i>';
            copyButton.title = 'Copy code';
            copyButton.addEventListener('click', () => {
                navigator.clipboard.writeText(codeElement.innerText).then(() => {
                    copyButton.innerHTML = '<i class="fas fa-check text-green-400"></i>';
                    setTimeout(() => {
                        copyButton.innerHTML = '<i class="far fa-copy"></i>';
                    }, 2000);
                });
            });
    
            // 2. Edit Button ✏️ (Opens side panel)
            const editButton = document.createElement('button');
            editButton.innerHTML = '<i class="far fa-edit"></i>';
            editButton.title = 'Edit in panel';
            editButton.addEventListener('click', () => {
                openCodeEditorPanel(pre);
            });
    
            // 3. Download Button 💾
            const downloadButton = document.createElement('button');
            downloadButton.innerHTML = '<i class="fas fa-download"></i>';
            downloadButton.title = 'Download file';
            downloadButton.addEventListener('click', () => {
                const codeText = codeElement.innerText;
                const extensionMap = {
                    'javascript': 'js', 'python': 'py', 'java': 'java', 'c': 'c', 'cpp': 'cpp', 'csharp': 'cs', 
                    'html': 'html', 'css': 'css', 'ruby': 'rb', 'go': 'go', 'rust': 'rs', 'php': 'php', 
                    'shell': 'sh', 'sql': 'sql', 'json': 'json', 'yaml': 'yml', 'markdown': 'md', 'xml': 'xml', 'typescript': 'ts'
                };
                const fileExtension = extensionMap[language] || 'txt';
                const filename = `Starlight-code.${fileExtension}`;
                const blob = new Blob([codeText], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
    
            buttonContainer.appendChild(copyButton);
            buttonContainer.appendChild(editButton);
            buttonContainer.appendChild(downloadButton);
            
            pre.appendChild(buttonContainer);
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

    // ✅ FIXED: Add event listeners for code editor panel functionality
    if (codeEditorCloseBtn) {
        codeEditorCloseBtn.addEventListener('click', closeCodeEditorPanel);
    }

    if (codeEditorCopyBtn) {
        codeEditorCopyBtn.addEventListener('click', () => {
            const textToCopy = codeEditorTextarea ? codeEditorTextarea.value : (codeEditorContent ? codeEditorContent.textContent : '');
            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    codeEditorCopyBtn.innerHTML = '<i class="fas fa-check text-green-400"></i>';
                    setTimeout(() => {
                        codeEditorCopyBtn.innerHTML = '<i class="far fa-copy"></i>';
                    }, 2000);
                });
            }
        });
    }
    
    // FIXED: Updated download button to work with textarea
    if (codeEditorDownloadBtn) {
        codeEditorDownloadBtn.addEventListener('click', () => {
            const codeText = codeEditorTextarea ? codeEditorTextarea.value : (codeEditorContent ? codeEditorContent.textContent : '');
            if (!codeText) return;
            
            // Get language from the textarea or content element
            let language = 'plaintext';
            if (codeEditorTextarea) {
                // Try to get language from the wrapper or stored value
                const wrapper = codeEditorTextarea.closest('#code-editor-content-wrapper');
                if (wrapper && wrapper.dataset.language) {
                    language = wrapper.dataset.language;
                }
            } else if (codeEditorContent) {
                language = getCodeLanguage(codeEditorContent);
            }
            
            const extensionMap = {
                'javascript': 'js', 'python': 'py', 'java': 'java', 'c': 'c', 'cpp': 'cpp', 'csharp': 'cs',
                'html': 'html', 'css': 'css', 'ruby': 'rb', 'go': 'go', 'rust': 'rs', 'php': 'php',
                'shell': 'sh', 'sql': 'sql', 'json': 'json', 'yaml': 'yml', 'markdown': 'md', 'xml': 'xml', 'typescript': 'ts'
            };
            const fileExtension = extensionMap[language] || 'txt';
            const filename = `code.${fileExtension}`;
            const blob = new Blob([codeText], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }
    
    // FIXED: Add undo button event listener (moved outside of nested DOMContentLoaded)
    if (codeEditorUndoBtn) {
        codeEditorUndoBtn.addEventListener('click', () => {
            console.log('Undo button clicked'); // Debug log
            if (codeEditorTextarea && originalCodeContent) {
                console.log('Reverting to original content:', originalCodeContent); // Debug log
                codeEditorTextarea.value = originalCodeContent;
                currentEditedCode = originalCodeContent;
                
                // Remove the saved edited version
                if (activeCodeBlock.pre) {
                    const codeBlockId = generateCodeBlockId(activeCodeBlock.pre);
                    localStorage.removeItem(`edited_code_${codeBlockId}`);
                    console.log('Removed saved content for:', codeBlockId); // Debug log
                }
                
                updateUndoButtonState();
            } else {
                console.log('Undo failed - textarea or original content missing'); // Debug log
            }
        });
    }

    function cleanupOldSavedCodes() {
        const keys = Object.keys(localStorage);
        const codeKeys = keys.filter(key => key.startsWith('edited_code_'));
        
        // Keep only the last 50 edited codes to prevent localStorage bloat
        if (codeKeys.length > 50) {
            const oldKeys = codeKeys.slice(0, codeKeys.length - 50);
            oldKeys.forEach(key => localStorage.removeItem(key));
        }
    }

    // ✅ FIXED: Add resize handle event listener
    if (resizeHandle) {
        resizeHandle.addEventListener('mousedown', startResize);
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
                force_thinking: forceThinking, // Add this line
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
                        combinedReasoningSSE = combinedReasoningSSE ? `${combinedReasoningSSE}${data}` : data;  // Changed += to direct concatenation
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
        
        if (sender === 'ai') {
            const toolUiContainer = document.createElement('div');
            toolUiContainer.className = 'tool-ui-container mb-1 ml-4';
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
        button.className = 'toggle-sources-btn mt-2 px-4 py-2 bg-transparent border border-1 hover:bg-[#333537] text-xs text-white rounded-xl flex items-center gap-2';
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

    if (codeEditorPanel) {
        codeEditorCloseBtn.addEventListener('click', closeCodeEditorPanel);

        codeEditorCopyBtn.addEventListener('click', () => {
            if (!codeEditorContent) return;
            navigator.clipboard.writeText(codeEditorContent.textContent).then(() => {
                codeEditorCopyBtn.innerHTML = '<i class="fas fa-check text-green-400"></i>';
                setTimeout(() => {
                    codeEditorCopyBtn.innerHTML = '<i class="far fa-copy"></i>';
                }, 2000);
            });
        });

        codeEditorDownloadBtn.addEventListener('click', () => {
            if (!codeEditorContent) return;
            const codeText = codeEditorContent.textContent;
            const language = getCodeLanguage(codeEditorContent);
            const extensionMap = {
                'javascript': 'js', 'python': 'py', 'java': 'java', 'c': 'c', 'cpp': 'cpp', 'csharp': 'cs',
                'html': 'html', 'css': 'css', 'ruby': 'rb', 'go': 'go', 'rust': 'rs', 'php': 'php',
                'shell': 'sh', 'sql': 'sql', 'json': 'json', 'yaml': 'yml', 'markdown': 'md', 'xml': 'xml', 'typescript': 'ts'
            };
            const fileExtension = extensionMap[language] || 'txt';
            const filename = `code.${fileExtension}`;
            const blob = new Blob([codeText], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
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

    console.log('=== DROPDOWN DEBUG INFO ===');
    // const dropdownBtn = document.getElementById("dropdown-btn");
    // const dropdownMenu = document.getElementById("dropdown-menu");
    // const dropdownLabel = document.getElementById("dropdown-label");

    console.log('Dropdown Button:', dropdownBtn);
    console.log('Dropdown Menu:', dropdownMenu);
    console.log('Dropdown Label:', dropdownLabel);

    if (dropdownBtn && dropdownMenu && dropdownLabel) {
        console.log('All dropdown elements found!');
        
        // Test click event
        dropdownBtn.addEventListener('click', (e) => {
            console.log('Dropdown button clicked!');
            e.stopPropagation();
            dropdownMenu.classList.toggle("hidden");
            console.log('Menu hidden class:', dropdownMenu.classList.contains('hidden'));
        });
        
        // Test menu options
        const menuButtons = dropdownMenu.querySelectorAll("button");
        console.log('Found menu buttons:', menuButtons.length);
        
        menuButtons.forEach((btn, index) => {
            console.log(`Button ${index}:`, btn.getAttribute("data-value"), btn.innerText.trim());
            btn.addEventListener("click", (e) => {
                console.log('Menu option clicked:', btn.getAttribute("data-value"));
                const selectedModel = btn.getAttribute("data-value");
                const selectedLabel = btn.innerText.trim();
                dropdownLabel.textContent = selectedLabel;
                dropdownMenu.classList.add("hidden");
                localStorage.setItem("selectedModel", selectedModel);
                localStorage.setItem("selectedLabel", selectedLabel);
                console.log('Model updated to:', selectedModel);
            });
        });
        
        // Close dropdown when clicking outside
        document.addEventListener("click", (e) => {
            if (!dropdownBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.classList.add("hidden");
            }
        });
        
        // Load saved model
        let selectedModel = localStorage.getItem("selectedModel") || "x-ai/grok-4-fast:free";
        let selectedLabel = localStorage.getItem("selectedLabel") || "GPT 2o";
        dropdownLabel.textContent = selectedLabel;
        console.log('Loaded saved model:', selectedModel, selectedLabel);
        
        // Make getSelectedModel function available globally
        window.getSelectedModel = () => {
            console.log('getSelectedModel called, returning:', selectedModel);
            return selectedModel;
        };
        
    } else {
        console.error('DROPDOWN SETUP FAILED - Missing elements:');
        if (!dropdownBtn) console.error('- dropdown-btn not found');
        if (!dropdownMenu) console.error('- dropdown-menu not found');  
        if (!dropdownLabel) console.error('- dropdown-label not found');
    }

    console.log('=== END DROPDOWN DEBUG ===');

    document.querySelectorAll('#sidebar nav a').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth < 768) {
                document.body.classList.add("sidebar-collapsed");
            }
        });
    });
});