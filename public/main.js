document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const downloadButton = document.getElementById('download-button');
const spinner = document.getElementById('spinner');
const currentSectionDisplay = document.getElementById('current-section-display');
    const progressButton = document.getElementById('progress-button');
    const currentVersionButton = document.getElementById('current-version-button');

    let currentSection = ''; // Declare currentSection here 

    // For simplicity, using a fixed session ID. In a real app, this would be managed.
    const sessionId = 'session_' + new Date().getTime(); 

    function addMessageToChat(sender, message, isMarkdown = false, messageId = null) {
        let messageDiv;
        if (messageId) {
            messageDiv = document.getElementById(messageId);
        }

        if (messageDiv) { // Element już istnieje, dopisujemy
            if (isMarkdown) {
                const pre = messageDiv.querySelector('pre') || document.createElement('pre');
                pre.textContent += message; // Dopisujemy do istniejącego pre
                if (!messageDiv.querySelector('pre')) messageDiv.appendChild(pre);
            } else {
                // Jeśli dopisujemy do zwykłego tekstu, upewnijmy się, że nie tworzymy zagnieżdżonych <pre>
                const existingPre = messageDiv.querySelector('pre');
                if (existingPre) existingPre.textContent += message;
                else messageDiv.textContent += message; // Dopisujemy do textContent
            }
        } else { // Tworzymy nowy element
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
        let firstChunkReceived = false;
        let isThinking = false; 

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

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let firstTokenProcessed = false;

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                if (spinner) spinner.style.display = 'none'; // Ensure spinner is hidden at the very end
                    // Sprawdzenie ostatniego fragmentu w buforze
                    if (buffer.trim().startsWith('data:')) {
                        const jsonString = buffer.substring(buffer.indexOf('data:') + 5).trim();
                        if (jsonString) { // Ensure jsonString is not empty
                            try {
                                const parsedData = JSON.parse(jsonString);
                                if (parsedData.currentSection && currentSectionDisplay) {
                                    currentSection = parsedData.currentSection;
                                    currentSectionDisplay.textContent = `Aktualna sekcja: ${currentSection}`;
                                }
                                if (parsedData.isComplete) {
                                    downloadButton.style.display = 'inline-block';
                                    if (currentSectionDisplay) currentSectionDisplay.textContent = "Dokument ukończony!";
                                }
                            } catch (e) {
                                console.error('Failed to parse final JSON from stream buffer:', jsonString, e);
                            }
                        }
                    }
                    break; 
                }
                if (!firstChunkReceived && value) { // Check value to ensure it's not an empty chunk signal
                if (spinner) spinner.style.display = 'none';
                firstChunkReceived = true;
            }
            buffer += decoder.decode(value, { stream: true });

                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, newlineIndex).trim();
                    buffer = buffer.substring(newlineIndex + 1);

                    if (line.startsWith('data:')) {
                        const jsonString = line.substring(5);
                        try {
                            const parsedData = JSON.parse(jsonString);

                            if (parsedData.error) {
                                console.error("Error from stream:", parsedData.error);
                                displayError("Błąd strumienia: " + parsedData.error);
                                break; 
                            }

                            if (parsedData.event === 'done') {
                                console.log('Stream finished:', parsedData);
                                if (currentSectionDisplay && parsedData.currentSection) {
                                    currentSectionDisplay.textContent = `Aktualna sekcja: ${parsedData.currentSection}`;
                                }
                                if (parsedData.isComplete) {
                                    downloadButton.style.display = 'inline-block';
                                    if (currentSectionDisplay) currentSectionDisplay.textContent = "Dokument ukończony!";
                                }
                                // Opcjonalnie zaktualizuj ostatnią wiadomość pełną treścią
                                // if (assistantMessageId && parsedData.fullResponse) {
                                //    const msgDiv = document.getElementById(assistantMessageId);
                                //    if (msgDiv) msgDiv.textContent = parsedData.fullResponse; 
                                // }
                                return; 
                            }
                            
                            if (parsedData.token) {
                                let tokenContent = parsedData.token;
                                let processToken = true;

                                // Handle <think> and </think> tags potentially within the same token or across tokens
                                while (processToken && tokenContent.length > 0) {
                                    if (isThinking) {
                                        const endThinkingIndex = tokenContent.indexOf('</think>');
                                        if (endThinkingIndex !== -1) {
                                            isThinking = false;
                                            tokenContent = tokenContent.substring(endThinkingIndex + '</think>'.length);
                                            // Continue processing the rest of the token in the next iteration
                                        } else {
                                            // Still thinking, discard this part of the token
                                            tokenContent = ''; 
                                        }
                                    } else {
                                        const startThinkingIndex = tokenContent.indexOf('<think>');
                                        if (startThinkingIndex !== -1) {
                                            // Add content before <think>
                                            const beforeThinking = tokenContent.substring(0, startThinkingIndex);
                                            if (beforeThinking) {
                                                if (!assistantMessageId) assistantMessageId = 'assistant-msg-' + Date.now();
                                                addMessageToChat('assistant', beforeThinking, false, assistantMessageId);
                                            }
                                            isThinking = true;
                                            tokenContent = tokenContent.substring(startThinkingIndex + '<think>'.length);
                                             // Continue processing the rest of the token (after <think>) in the next iteration
                                        } else {
                                            // No thinking tags, add the whole token
                                            if (tokenContent) {
                                                if (!assistantMessageId) assistantMessageId = 'assistant-msg-' + Date.now();
                                                addMessageToChat('assistant', tokenContent, false, assistantMessageId);
                                            }
                                            tokenContent = ''; // Mark as processed
                                        }
                                    }
                                }
                                firstTokenProcessed = true;
                            }
                        } catch (e) {
                            console.error('Failed to parse JSON from stream line:', jsonString, e);
                        }
                    }
                }
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

    if (sendButton) { // Check if sendButton exists
        sendButton.addEventListener('click', () => sendMessage(messageInput.value));
    }
    if (messageInput) { // Check if messageInput exists
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
            sendMessage(messageInput.value);
        }
    });
    }

    async function handleSpecialCommand(command) {
        // command parameter is already correct from previous changes
        if (spinner) spinner.style.display = 'inline';
        // Preserve current section display if already set
        if (currentSectionDisplay && currentSection && currentSectionDisplay.textContent.startsWith('Aktualna sekcja:')) {
            // no change, or spinner text will overwrite it briefly
        } else if (currentSectionDisplay) {
            currentSectionDisplay.textContent = 'Przetwarzanie komendy...';
        }
        if (sendButton) sendButton.disabled = true;
        if (messageInput) messageInput.disabled = true;
        addMessageToChat('user', command);
        messageInput.value = ''; // Clear input field 
        clearError();
        sendButton.disabled = true;
        messageInput.disabled = true;
        
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: command, sessionId: sessionId }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            // Te komendy zwracają JSON, nie strumień.
            // Tworzymy nowy dymek dla odpowiedzi, a nie aktualizujemy istniejący.
            const newAssistantMsgId = 'assistant-cmd-msg-' + Date.now();
            if (data.isDocument) {
                addMessageToChat('assistant', data.response, true, newAssistantMsgId);
            } else {
                addMessageToChat('assistant', data.response, false, newAssistantMsgId);
            }

            if (currentSectionDisplay && data.currentSection) {
                 currentSectionDisplay.textContent = `Aktualna sekcja: ${data.currentSection}`;
            }
            if (data.progress && currentSectionDisplay) { // Specjalnie dla progress
                currentSectionDisplay.textContent = `Postęp: ${Math.round(parseFloat(data.progress) * 100)}% (Sekcja: ${data.currentSection || 'Brak'})`;
            }
            if (data.isComplete) {
                downloadButton.style.display = 'inline-block';
                 if (currentSectionDisplay) currentSectionDisplay.textContent = "Dokument ukończony!";
            }

        } catch (error) {
            console.error(`Error with command ${command}:`, error);
            addMessageToChat('assistant', `Błąd podczas wykonywania komendy "${command}": ${error.message}`, false);
            if (currentSectionDisplay && currentSection) currentSectionDisplay.textContent = `Aktualna sekcja: ${currentSection}`; // Restore section
            else if (currentSectionDisplay) currentSectionDisplay.textContent = 'Błąd komendy.';
            if (spinner) spinner.style.display = 'none';
        } finally {
            sendButton.disabled = false;
            messageInput.disabled = false;
            messageInput.focus();
        }
    }

if (progressButton) {
    progressButton.addEventListener('click', () => handleSpecialCommand('progress'));
}

if (currentVersionButton) {
    currentVersionButton.addEventListener('click', () => handleSpecialCommand('aktualna wersja'));
}

if (downloadButton) {
    downloadButton.addEventListener('click', () => {
        window.location.href = `/api/document/download?sessionId=${sessionId}`;
    });
}

// Initial message to get the first question from the assistant
if (currentSectionDisplay) currentSectionDisplay.textContent = 'Aktualna sekcja: Ładowanie...';
sendMessage('Zaczynajmy'); 
});