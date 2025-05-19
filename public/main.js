document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const downloadButton = document.getElementById('download-button');
    const progressButton = document.getElementById('progress-button');
    const currentVersionButton = document.getElementById('current-version-button');
    const currentSectionDisplay = document.getElementById('current-section-display'); 

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

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let firstTokenProcessed = false;

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    // Sprawdzenie ostatniego fragmentu w buforze
                    if (buffer.trim().startsWith('data:')) {
                        const jsonString = buffer.substring(buffer.indexOf('data:') + 5).trim();
                         try {
                            const parsedData = JSON.parse(jsonString);
                            if (parsedData.event === 'done') {
                                if (currentSectionDisplay && parsedData.currentSection) {
                                    currentSectionDisplay.textContent = `Aktualna sekcja: ${parsedData.currentSection}`;
                                }
                                if (parsedData.isComplete) {
                                    downloadButton.style.display = 'inline-block';
                                    if (currentSectionDisplay) currentSectionDisplay.textContent = "Dokument ukończony!";
                                }
                            } else if (parsedData.token && assistantMessageId) {
                                addMessageToChat('assistant', parsedData.token, false, assistantMessageId);
                            }
                        } catch (e) {
                            console.error('Failed to parse final JSON from stream buffer:', jsonString, e);
                        }
                    }
                    break; 
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
                                if (!assistantMessageId) {
                                    assistantMessageId = 'assistant-msg-' + Date.now();
                                    addMessageToChat('assistant', parsedData.token, false, assistantMessageId);
                                } else {
                                    addMessageToChat('assistant', parsedData.token, false, assistantMessageId);
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
            addMessageToChat('assistant', 'Przepraszam, wystąpił błąd: ' + error.message);
            displayError('Nie udało się połączyć z serwerem lub wystąpił błąd przetwarzania: ' + error.message);
        } finally {
            sendButton.disabled = false;
            messageInput.disabled = false;
            messageInput.focus();
        }
    }

    sendButton.addEventListener('click', () => sendMessage(messageInput.value));
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage(messageInput.value);
        }
    });

    async function handleSpecialCommand(command) {
        addMessageToChat('user', command); 
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
            addMessageToChat('assistant', `Błąd podczas wykonywania komendy "${command}": ${error.message}`);
            displayError(`Błąd komendy "${command}": ${error.message}`);
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
    sendMessage(''); 
});
