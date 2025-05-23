document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const downloadButton = document.getElementById('download-button');
    const spinner = document.getElementById('spinner');
    const currentSectionDisplay = document.getElementById('current-section-display');
    const progressButton = document.getElementById('progress-button');
    const currentVersionButton = document.getElementById('current-version-button');

    let currentSection = ''; // Track current section

    // For simplicity, using a fixed session ID. In a real app, this would be managed.
    const sessionId = 'session_' + new Date().getTime();

    function addMessageToChat(sender, message, isMarkdown = false, messageId = null) {
        let messageDiv;
        if (messageId) {
            messageDiv = document.getElementById(messageId);
        }

        if (messageDiv) { // Update existing message
            if (isMarkdown) {
                const pre = messageDiv.querySelector('pre') || document.createElement('pre');
                pre.textContent += message;
                if (!messageDiv.querySelector('pre')) messageDiv.appendChild(pre);
            } else {
                const existingPre = messageDiv.querySelector('pre');
                if (existingPre) existingPre.textContent += message;
                else messageDiv.textContent += message;
            }
        } else { // Create new message
            messageDiv = document.createElement('div');
            messageDiv.classList.add('message');
            messageDiv.classList.add(sender === 'user' ? 'user-message' : 'assistant-message');
            if (messageId) {
                messageDiv.id = messageId;
            }
            
            if (isMarkdown) {
                const pre = document.createElement('pre');
                pre.textContent = message;
                messageDiv.appendChild(pre);
            } else {
                messageDiv.textContent = message;
            }
            chatContainer.appendChild(messageDiv);
        }
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function displayError(errorMessage) {
        let errorDiv = document.getElementById('app-error-message');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'app-error-message';
            errorDiv.classList.add('error-message');
            chatContainer.parentNode.insertBefore(errorDiv, chatContainer);
        }
        errorDiv.textContent = errorMessage;
        errorDiv.style.display = 'block';
    }

    function clearError() {
        const errorDiv = document.getElementById('app-error-message');
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
    }

    async function sendMessage(messageText) {
        if (spinner) spinner.style.display = 'inline';
        if (currentSectionDisplay && !messageText) currentSectionDisplay.textContent = 'Aktualna sekcja: Ładowanie...';
        
        if (!messageText && chatContainer.children.length === 0) {
            // Initial message
        } else if (!messageText?.trim() && chatContainer.children.length > 0) {
            return;
        }

        if (messageText) {
            addMessageToChat('user', messageText);
        }
       
        messageInput.value = '';
        clearError();
        sendButton.disabled = true;
        messageInput.disabled = true;

        let assistantMessageId = null;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: messageText || '', sessionId: sessionId }),
            });

            if (!response.ok) {
                if (response.headers.get("content-type")?.includes("application/json")) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
                } else {
                    throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
                }
            }
            
            // Handle the new JSON response format
            const data = await response.json();
            
            if (spinner) spinner.style.display = 'none';
            
            // Handle the response based on the new format
            if (data.isQuestion) {
                // This is a question from the system
                assistantMessageId = 'assistant-msg-' + Date.now();
                addMessageToChat('assistant', data.message, false, assistantMessageId);
                
                // Update section display if we have section information
                if (data.rawQuestion && currentSectionDisplay) {
                    currentSection = data.rawQuestion;
                    currentSectionDisplay.textContent = `Aktualna sekcja: ${currentSection}`;
                }
            } else if (data.allQuestionsAnswered) {
                // All questions have been answered
                assistantMessageId = 'assistant-msg-' + Date.now();
                addMessageToChat('assistant', data.message, false, assistantMessageId);
                
                if (currentSectionDisplay) {
                    currentSectionDisplay.textContent = 'Dokument ukończony!';
                }
                
                // Show download button if all questions are answered
                downloadButton.style.display = 'inline-block';
            } else {
                // Regular response
                assistantMessageId = 'assistant-msg-' + Date.now();
                addMessageToChat('assistant', data.message || 'Otrzymano odpowiedź bez treści', false, assistantMessageId);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            addMessageToChat('assistant', 'Przepraszam, wystąpił błąd: ' + error.message, false);
            if (currentSectionDisplay && currentSection) currentSectionDisplay.textContent = `Aktualna sekcja: ${currentSection}`; // Restore last known section on error
            else if (currentSectionDisplay) currentSectionDisplay.textContent = 'Błąd komunikacji.';
            if (spinner) spinner.style.display = 'none';
        } finally {
            sendButton.disabled = false;
            messageInput.disabled = false;
            messageInput.focus();
        }
    }

    if (sendButton) {
        sendButton.addEventListener('click', () => sendMessage(messageInput.value));
    }
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage(messageInput.value);
            }
        });
    }

    async function handleSpecialCommand(command) {
        if (spinner) spinner.style.display = 'inline';
        // Preserve current section display if already set
        if (currentSectionDisplay && currentSection && currentSectionDisplay.textContent.startsWith('Aktualna sekcja:')) {
            // no change
        } else if (currentSectionDisplay) {
            currentSectionDisplay.textContent = 'Przetwarzanie komendy...';
        }
        
        addMessageToChat('user', command);
        messageInput.value = ''; // Clear input field 
        clearError();
        sendButton.disabled = true;
        messageInput.disabled = true;
        
        try {
            const response = await fetch('/api/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command, sessionId }),
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Create new message for the response
            const newAssistantMsgId = 'assistant-cmd-msg-' + Date.now();
            if (data.document) {
                // This is a document response
                addMessageToChat('assistant', data.document, true, newAssistantMsgId);
                
                if (currentSectionDisplay) {
                    currentSectionDisplay.textContent = 'Dokument ukończony!';
                }
                
                // Show download button
                downloadButton.style.display = 'inline-block';
            } else {
                // Regular response
                addMessageToChat('assistant', data.message || 'Otrzymano odpowiedź bez treści', false, newAssistantMsgId);
            }
        } catch (error) {
            console.error(`Error with command ${command}:`, error);
            addMessageToChat('assistant', `Błąd podczas wykonywania komendy "${command}": ${error.message}`, false);
            if (currentSectionDisplay && currentSection) currentSectionDisplay.textContent = `Aktualna sekcja: ${currentSection}`; // Restore section
            else if (currentSectionDisplay) currentSectionDisplay.textContent = 'Błąd komendy.';
        } finally {
            if (spinner) spinner.style.display = 'none';
            sendButton.disabled = false;
            messageInput.disabled = false;
            messageInput.focus();
        }
    }

    if (progressButton) {
        progressButton.addEventListener('click', () => handleSpecialCommand('/progress'));
    }

    if (currentVersionButton) {
        currentVersionButton.addEventListener('click', () => handleSpecialCommand('/show_document'));
    }

    if (downloadButton) {
        downloadButton.addEventListener('click', () => {
            window.location.href = `/api/document/${sessionId}`;
        });
    }

    // Initial message to get the first question from the assistant
    if (currentSectionDisplay) currentSectionDisplay.textContent = 'Aktualna sekcja: Ładowanie...';
    sendMessage(''); 
});
